import { eq } from 'drizzle-orm';

import type { Database } from '../client';
import { sessions } from '../schema';

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

export async function getSession(db: Database, id: string) {
  const row = await db.query.sessions.findFirst({ where: (s, { eq }) => eq(s.id, id) });
  return row ?? null;
}

export async function setCurrentSessionExercise(
  db: Database,
  sessionId: string,
  sessionExerciseId: string | null,
) {
  await db
    .update(sessions)
    .set({ currentSessionExerciseId: sessionExerciseId })
    .where(eq(sessions.id, sessionId));
}

// Duration is calculated ONCE here, as last-set-timestamp minus first-set-timestamp,
// then stored — never wall-clock close-time-minus-start-time. See CLAUDE.md
// "Duration": a session finalized the next morning must still read the real length.
export async function finishSession(db: Database, sessionId: string) {
  return db.transaction(async (tx) => {
    const sessionSets = await tx.query.sets.findMany({
      where: (s, { eq }) => eq(s.sessionId, sessionId),
    });
    let durationSeconds: number | null = null;
    if (sessionSets.length > 0) {
      const timestamps = sessionSets.map((s) => s.loggedAt.getTime());
      durationSeconds = Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1000);
    }
    const [row] = await tx
      .update(sessions)
      .set({ status: 'complete', durationSeconds })
      .where(eq(sessions.id, sessionId))
      .returning();
    return row;
  });
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
