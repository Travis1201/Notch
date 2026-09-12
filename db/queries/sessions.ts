import { and, eq } from 'drizzle-orm';

import type { Database } from '../client';
import { sessions, sessionExercises, sets } from '../schema';
import { getTemplateExercises } from './templates';
import { computeDurationSeconds } from '../../lib/sessionDuration';
import { getLastUsedBrand, findOrCreateEquipmentVariant } from './equipmentVariants';

export async function getInProgressSession(db: Database) {
  const row = await db.query.sessions.findFirst({
    where: (s, { eq }) => eq(s.status, 'in_progress'),
  });
  return row ?? null;
}

export async function startEmptySession(db: Database, input: { gymId: string }) {
  const [row] = await db
    .insert(sessions)
    .values({
      date: new Date(),
      gymId: input.gymId,
      templateId: null,
      status: 'in_progress',
      currentSessionExerciseId: null,
    })
    .returning();
  return row;
}

// CLAUDE.md "Templates": "stores structure only" — starting from one just copies that
// structure into fresh session_exercises rows, each resolving its own equipment
// variant the same way a mid-workout "Add exercise" does (brand memory per
// exercise+gym). Numbers are never copied; every exercise's pre-fill still comes live
// from its own history once the session loads. Variant resolution happens before the
// transaction — findOrCreateEquipmentVariant runs its own transaction internally, and
// this avoids relying on nested-transaction support.
export async function startTemplateSession(
  db: Database,
  input: { gymId: string; templateId: string },
) {
  const templateExerciseRows = await getTemplateExercises(db, input.templateId);

  const variantIds: string[] = [];
  for (const te of templateExerciseRows) {
    const rememberedBrand = await getLastUsedBrand(db, te.exerciseId, input.gymId);
    const variant = await findOrCreateEquipmentVariant(db, {
      exerciseId: te.exerciseId,
      gymId: input.gymId,
      brand: rememberedBrand,
    });
    variantIds.push(variant.id);
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        date: new Date(),
        gymId: input.gymId,
        templateId: input.templateId,
        status: 'in_progress',
        currentSessionExerciseId: null,
      })
      .returning();

    if (templateExerciseRows.length > 0) {
      await tx.insert(sessionExercises).values(
        templateExerciseRows.map((te, position) => ({
          sessionId: session.id,
          exerciseId: te.exerciseId,
          position,
          status: 'pending' as const,
          createdAt: new Date(),
          equipmentVariantId: variantIds[position],
        })),
      );
    }

    return session;
  });
}

// Home screen template rows ("Pull day ↗2", "4 days ago") need each template's most
// recent finished session — this is that lookup.
export async function getLastCompletedSessionForTemplate(db: Database, templateId: string) {
  const row = await db.query.sessions.findFirst({
    where: (s, { eq: eqOp }) => and(eqOp(s.templateId, templateId), eqOp(s.status, 'complete')),
    orderBy: (s, { desc }) => desc(s.date),
  });
  return row ?? null;
}

export async function getSession(db: Database, id: string) {
  const row = await db.query.sessions.findFirst({ where: (s, { eq }) => eq(s.id, id) });
  return row ?? null;
}

// Home screen "Last lifted X days ago" — the most recent session that actually
// finished, so an abandoned in-progress session doesn't get reported as "today".
export async function getLastCompletedSession(db: Database) {
  const row = await db.query.sessions.findFirst({
    where: (s, { eq }) => eq(s.status, 'complete'),
    orderBy: (s, { desc }) => desc(s.date),
  });
  return row ?? null;
}

// Duration is calculated ONCE here, as last-set-timestamp minus first-set-timestamp,
// then stored — never wall-clock close-time-minus-start-time. See CLAUDE.md
// "Duration": a session finalized the next morning must still read the real length.
export async function finishSession(db: Database, sessionId: string) {
  return db.transaction(async (tx) => {
    const sessionSets = await tx.query.sets.findMany({
      where: (s, { eq }) => eq(s.sessionId, sessionId),
    });
    // lib/sessionDuration.ts, shared with the finish-confirmation screen's preview so
    // the number the user is shown is the number that gets stored.
    const durationSeconds = computeDurationSeconds(sessionSets);
    const [row] = await tx
      .update(sessions)
      .set({ status: 'complete', durationSeconds })
      .where(eq(sessions.id, sessionId))
      .returning();
    return row;
  });
}

// History tab — every finished session, most recent first. CLAUDE.md "History
// editing": past sessions are a normal, fully-editable case, so this deliberately
// isn't paginated/filtered — it's the whole record.
export async function listCompletedSessions(db: Database) {
  return db.query.sessions.findMany({
    where: (s, { eq }) => eq(s.status, 'complete'),
    orderBy: (s, { desc }) => desc(s.date),
  });
}

// Discards an in-progress session entirely and leaves nothing behind — the "cancel
// workout" escape hatch. Finishing a session you didn't actually train writes a real,
// permanent, zero-or-near-zero workout into History and into every chart and green-
// arrow comparison that reads from it (a 0-set session becomes the "previous session"
// the next real one is measured against), so "just hit Finish" was never an
// equivalent way out. Cancel is the only way to undo starting a workout.
//
// Deliberately refuses to touch a COMPLETE session: deleting one of those is History
// editing's own confirmed destructive action (deleteSession), reached from the session
// detail screen, and must not be triggerable from a stale in-progress screen.
export async function cancelSession(db: Database, sessionId: string) {
  const session = await getSession(db, sessionId);
  if (!session || session.status !== 'in_progress') return false;
  await deleteSession(db, sessionId);
  return true;
}

// CLAUDE.md "History editing": "Deleting a whole session (confirm first — the only
// destructive action in the app)." Children first — sets and session_exercises both
// reference sessionId — then the session row itself.
export async function deleteSession(db: Database, sessionId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(sets).where(eq(sets.sessionId, sessionId));
    await tx.delete(sessionExercises).where(eq(sessionExercises.sessionId, sessionId));
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
  });
}

// CLAUDE.md "History editing": "Correcting a session's gym or date."
export async function updateSessionGym(db: Database, sessionId: string, gymId: string) {
  const [row] = await db.update(sessions).set({ gymId }).where(eq(sessions.id, sessionId)).returning();
  return row;
}

export async function updateSessionDate(db: Database, sessionId: string, date: Date) {
  const [row] = await db.update(sessions).set({ date }).where(eq(sessions.id, sessionId)).returning();
  return row;
}

const AUTO_CLOSE_MS = 3 * 60 * 60 * 1000; // 3 hours — CLAUDE.md "Auto-close"

// Any in-progress session whose last set (or session.date, if it has none) is older
// than the auto-close threshold gets finalized exactly like a manual finish — never
// discards data, just flips status so it stops appearing as resumable.
export async function autoCloseStaleSessions(db: Database, now: Date = new Date()) {
  const inProgress = await db.query.sessions.findMany({
    where: (s, { eq }) => eq(s.status, 'in_progress'),
  });

  for (const session of inProgress) {
    const sessionSets = await db.query.sets.findMany({
      where: (s, { eq }) => eq(s.sessionId, session.id),
    });
    const lastActivity =
      sessionSets.length > 0
        ? new Date(Math.max(...sessionSets.map((s) => s.loggedAt.getTime())))
        : session.date;
    if (now.getTime() - lastActivity.getTime() > AUTO_CLOSE_MS) {
      await finishSession(db, session.id);
    }
  }
}
