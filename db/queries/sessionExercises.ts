import { and, eq, inArray, max } from 'drizzle-orm';

import type { Database } from '../client';
import { equipmentVariants, sessionExercises, sets } from '../schema';

export async function listSessionExercises(db: Database, sessionId: string) {
  return db.query.sessionExercises.findMany({
    where: (se, { eq }) => eq(se.sessionId, sessionId),
    orderBy: (se, { asc }) => asc(se.position),
    with: { exercise: true },
  });
}

// position = current max+1 (0 for the first). CLAUDE.md "Active workout screen": no
// forced order, no "current exercise" pointer — every exercise's section is visible
// and independently loggable from the moment it's added. Caller resolves
// `equipmentVariantId` beforehand (typically via getLastUsedBrand +
// findOrCreateEquipmentVariant, so it defaults to whatever brand was last used for
// this exercise at this gym) — persisted here so a reload doesn't need to re-resolve
// it, and so it survives independent of whether any sets have been logged yet.
export async function addExerciseToSession(
  db: Database,
  input: { sessionId: string; exerciseId: string; equipmentVariantId: string },
) {
  const [{ maxPosition }] = await db
    .select({ maxPosition: max(sessionExercises.position) })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, input.sessionId));

  const [row] = await db
    .insert(sessionExercises)
    .values({
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      equipmentVariantId: input.equipmentVariantId,
      position: (maxPosition ?? -1) + 1,
      status: 'pending',
      createdAt: new Date(),
    })
    .returning();

  return row;
}

// Mid-session equipment brand change (the settings-bolt row on the logging screen).
// Already-logged sets keep referencing their original equipment_variant — this only
// repoints what NEW sets for this exercise get logged against going forward.
export async function updateSessionExerciseVariant(
  db: Database,
  sessionExerciseId: string,
  equipmentVariantId: string,
) {
  await db
    .update(sessionExercises)
    .set({ equipmentVariantId })
    .where(eq(sessionExercises.id, sessionExerciseId));
}

export async function reorderSessionExercises(
  db: Database,
  sessionId: string,
  orderedIds: string[],
) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(sessionExercises)
        .set({ position: i })
        .where(and(eq(sessionExercises.id, orderedIds[i]), eq(sessionExercises.sessionId, sessionId)));
    }
  });
}

// Removes one exercise from a session, along with any sets logged against it in THAT
// session — the mid-workout "I added this by mistake / I'm not doing it after all"
// escape hatch. Adding an exercise mid-session is a persistent row at the bottom of
// the scroll (CLAUDE.md "Mid-workout flexibility"), and until this existed there was
// no way back: a mis-tapped exercise stayed in the session forever, and on Finish it
// also showed up in the template-diff prompt as something to add to the template.
//
// Scoped to this session only. It deletes the session's sets for the exercise, never
// the equipment_variant rows or any set from another session — removing today's
// accidental "Preacher curl" must not erase the progression history of every real
// preacher curl session before it.
//
// Sets are keyed by equipment_variant, not by session_exercise, and a mid-session
// brand change repoints the session_exercise at a NEW variant (see
// updateSessionExerciseVariant) while leaving already-logged sets on the old one. So
// this matches on every variant of the exercise rather than only the row's current
// equipmentVariantId, which would otherwise orphan sets from before the switch —
// invisible in the UI but still counted by charts and duration.
//
// Positions are left with a gap rather than renumbered: `position` is only ever read
// as a sort key (listSessionExercises orders by it), so a hole is harmless, and
// rewriting every following row's position would race the reorder sheet's own writes.
export async function removeExerciseFromSession(
  db: Database,
  input: { sessionId: string; sessionExerciseId: string; exerciseId: string },
) {
  await db.transaction(async (tx) => {
    const variants = await tx
      .select({ id: equipmentVariants.id })
      .from(equipmentVariants)
      .where(eq(equipmentVariants.exerciseId, input.exerciseId));

    if (variants.length > 0) {
      await tx
        .delete(sets)
        .where(
          and(
            eq(sets.sessionId, input.sessionId),
            inArray(
              sets.equipmentVariantId,
              variants.map((v) => v.id),
            ),
          ),
        );
    }

    await tx
      .delete(sessionExercises)
      .where(
        and(
          eq(sessionExercises.id, input.sessionExerciseId),
          eq(sessionExercises.sessionId, input.sessionId),
        ),
      );
  });
}
