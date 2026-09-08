import { eq, desc } from 'drizzle-orm';

import type { Database } from '../client';
import { exercises, sessionExercises, sessions, type ExerciseEquipmentType } from '../schema';

export async function listExercises(db: Database) {
  return db.query.exercises.findMany({ orderBy: (e, { asc }) => asc(e.name) });
}

export async function getExercise(db: Database, id: string) {
  const row = await db.query.exercises.findFirst({ where: (e, { eq }) => eq(e.id, id) });
  return row ?? null;
}

export async function searchExercises(db: Database, query: string, opts?: { limit?: number }) {
  const limit = opts?.limit ?? 20;
  if (!query.trim()) {
    return db.query.exercises.findMany({ orderBy: (e, { asc }) => asc(e.name), limit });
  }
  return db.query.exercises.findMany({
    where: (e, { like }) => like(e.name, `%${query.trim()}%`),
    orderBy: (e, { asc }) => asc(e.name),
    limit,
  });
}

// Distinct exercises used in this session's history, most-recently-used first, ties
// broken by frequency — feeds the "Add exercise" sheet's recent/most-frequent list.
export async function listRecentOrFrequentExercises(db: Database, opts: { limit: number }) {
  const rows = await db
    .select({ exerciseId: sessionExercises.exerciseId, sessionDate: sessions.date })
    .from(sessionExercises)
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .orderBy(desc(sessions.date));

  const stats = new Map<string, { mostRecent: number; count: number }>();
  for (const row of rows) {
    const t = row.sessionDate.getTime();
    const existing = stats.get(row.exerciseId);
    if (existing) {
      existing.count += 1;
      if (t > existing.mostRecent) existing.mostRecent = t;
    } else {
      stats.set(row.exerciseId, { mostRecent: t, count: 1 });
    }
  }

  const orderedIds = [...stats.entries()]
    .sort((a, b) => b[1].mostRecent - a[1].mostRecent || b[1].count - a[1].count)
    .slice(0, opts.limit)
    .map(([exerciseId]) => exerciseId);

  if (orderedIds.length === 0) return [];
  const found = await db.query.exercises.findMany({
    where: (e, { inArray }) => inArray(e.id, orderedIds),
  });
  const byId = new Map(found.map((e) => [e.id, e]));
  return orderedIds.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
}

export async function createExercise(
  db: Database,
  input: { name: string; muscleGroup: string; equipmentType: ExerciseEquipmentType },
) {
  const [row] = await db
    .insert(exercises)
    .values({ ...input, isCustom: true })
    .returning();
  return row;
}

export async function updateExerciseRestSeconds(
  db: Database,
  exerciseId: string,
  restSeconds: number | null,
) {
  await db.update(exercises).set({ restSeconds }).where(eq(exercises.id, exerciseId));
}
