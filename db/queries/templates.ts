import { eq } from 'drizzle-orm';

import type { Database } from '../client';
import { templates, templateExercises, sessions } from '../schema';

export async function listTemplates(db: Database) {
  return db.query.templates.findMany({ orderBy: (t, { asc }) => asc(t.name) });
}

export async function getTemplate(db: Database, id: string) {
  const row = await db.query.templates.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  return row ?? null;
}

// Ordered exercise list for a template — CLAUDE.md "Templates": "stores structure
// only," so this is just exerciseId + position, joined out to the full exercise row
// for display.
export async function getTemplateExercises(db: Database, templateId: string) {
  return db.query.templateExercises.findMany({
    where: (te, { eq }) => eq(te.templateId, templateId),
    orderBy: (te, { asc }) => asc(te.position),
    with: { exercise: true },
  });
}

// Creates a template with its ordered exercise list in one transaction. exerciseIds
// order is the template's order; duplicates aren't filtered here — the editor UI is
// responsible for a sane list.
export async function createTemplate(
  db: Database,
  input: { name: string; exerciseIds: string[] },
) {
  return db.transaction(async (tx) => {
    const [template] = await tx.insert(templates).values({ name: input.name }).returning();
    if (input.exerciseIds.length > 0) {
      await tx.insert(templateExercises).values(
        input.exerciseIds.map((exerciseId, position) => ({
          templateId: template.id,
          exerciseId,
          position,
        })),
      );
    }
    return template;
  });
}

export async function updateTemplateName(db: Database, id: string, name: string) {
  const [row] = await db.update(templates).set({ name }).where(eq(templates.id, id)).returning();
  return row;
}

// Replaces the template's whole exercise list — simplest correct way to express
// "added, removed, or reordered" from an editor screen that just submits its current
// list, rather than diffing adds/removes/reorders individually.
export async function setTemplateExercises(db: Database, templateId: string, exerciseIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(templateExercises).where(eq(templateExercises.templateId, templateId));
    if (exerciseIds.length > 0) {
      await tx.insert(templateExercises).values(
        exerciseIds.map((exerciseId, position) => ({ templateId, exerciseId, position })),
      );
    }
  });
}

// Deleting a template must not delete the sessions logged from it — CLAUDE.md
// "History editing" treats past sessions as permanent, editable records, not things
// that vanish because their template did. Sessions keep their date/gym/sets; they just
// stop pointing at a template that no longer exists.
export async function deleteTemplate(db: Database, id: string) {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ templateId: null }).where(eq(sessions.templateId, id));
    await tx.delete(templateExercises).where(eq(templateExercises.templateId, id));
    await tx.delete(templates).where(eq(templates.id, id));
  });
}
