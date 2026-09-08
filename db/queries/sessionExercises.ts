import { and, asc, eq, gt, max } from 'drizzle-orm';

import type { Database } from '../client';
import { sessionExercises, sessions } from '../schema';

export async function listSessionExercises(db: Database, sessionId: string) {
  return db.query.sessionExercises.findMany({
    where: (se, { eq }) => eq(se.sessionId, sessionId),
    orderBy: (se, { asc }) => asc(se.position),
    with: { exercise: true },
  });
}

// position = current max+1 (0 for the first). If the session has no current exercise
// yet, this newly-added one also becomes current — both writes happen in one
// transaction per the Gotchas section ("wrap multi-row writes in transactions").
export async function addExerciseToSession(
  db: Database,
  input: { sessionId: string; exerciseId: string },
) {
  return db.transaction(async (tx) => {
    const [{ maxPosition }] = await tx
      .select({ maxPosition: max(sessionExercises.position) })
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, input.sessionId));

    const [row] = await tx
      .insert(sessionExercises)
      .values({
        sessionId: input.sessionId,
        exerciseId: input.exerciseId,
        position: (maxPosition ?? -1) + 1,
        status: 'pending',
        createdAt: new Date(),
      })
      .returning();

    const session = await tx.query.sessions.findFirst({
      where: (s, { eq }) => eq(s.id, input.sessionId),
    });
    if (session && !session.currentSessionExerciseId) {
      await tx
        .update(sessions)
        .set({ currentSessionExerciseId: row.id })
        .where(eq(sessions.id, input.sessionId));
    }

    return row;
  });
}

// If the skipped exercise was current, advances the pointer to the next pending row
// by position, or null if none remain — one transaction (Gotchas: multi-row writes).
export async function skipSessionExercise(db: Database, sessionExerciseId: string) {
  return db.transaction(async (tx) => {
    const row = await tx.query.sessionExercises.findFirst({
      where: (se, { eq }) => eq(se.id, sessionExerciseId),
    });
    if (!row) throw new Error('session_exercise not found');

    await tx
      .update(sessionExercises)
      .set({ status: 'skipped' })
      .where(eq(sessionExercises.id, sessionExerciseId));

    const session = await tx.query.sessions.findFirst({
      where: (s, { eq }) => eq(s.id, row.sessionId),
    });
    if (session?.currentSessionExerciseId === sessionExerciseId) {
      const next = await tx.query.sessionExercises.findFirst({
        where: and(
          eq(sessionExercises.sessionId, row.sessionId),
          eq(sessionExercises.status, 'pending'),
          gt(sessionExercises.position, row.position),
        ),
        orderBy: asc(sessionExercises.position),
      });
      await tx
        .update(sessions)
        .set({ currentSessionExerciseId: next?.id ?? null })
        .where(eq(sessions.id, row.sessionId));
    }
  });
}

export async function unskipSessionExercise(db: Database, sessionExerciseId: string) {
  await db
    .update(sessionExercises)
    .set({ status: 'pending' })
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
