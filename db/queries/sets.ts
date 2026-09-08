import { and, eq, ne, desc, max } from 'drizzle-orm';

import type { Database } from '../client';
import { sets, sessions } from '../schema';
import { selectTopSet } from '../../lib/progression';
import type { Set as SetRow } from '../types';

export async function listSetsForSession(db: Database, sessionId: string) {
  return db.query.sets.findMany({
    where: (s, { eq }) => eq(s.sessionId, sessionId),
    orderBy: (s, { asc }) => asc(s.position),
  });
}

// Finds the most recent OTHER session with >=1 set on this equipment variant, and
// returns its top set (per lib/progression's selectTopSet — the one required source
// of truth), full row including RIR. Feeds both pre-fill (lib/prefill.ts, which also
// needs RIR) and the green arrow with one query.
export async function getLastSessionTopSet(
  db: Database,
  equipmentVariantId: string,
  excludeSessionId: string,
  repFloor: number,
): Promise<SetRow | null> {
  const rows = await db
    .select({ sessionId: sets.sessionId, sessionDate: sessions.date })
    .from(sets)
    .innerJoin(sessions, eq(sets.sessionId, sessions.id))
    .where(and(eq(sets.equipmentVariantId, equipmentVariantId), ne(sets.sessionId, excludeSessionId)))
    .orderBy(desc(sessions.date))
    .limit(1);

  const lastSessionId = rows[0]?.sessionId;
  if (!lastSessionId) return null;

  const lastSets = await db.query.sets.findMany({
    where: (s, { eq }) => eq(s.sessionId, lastSessionId),
  });
  const forThisVariant = lastSets.filter((s) => s.equipmentVariantId === equipmentVariantId);
  return selectTopSet(forThisVariant, repFloor);
}

// No isWarmupOverride param — CLAUDE.md explicitly forbids a warm-up/working toggle
// at entry time. Always null on insert; only settable afterward via updateSet.
export async function logSet(
  db: Database,
  input: { sessionId: string; equipmentVariantId: string; weight: number; reps: number; rir: number },
) {
  return db.transaction(async (tx) => {
    const [{ maxPosition }] = await tx
      .select({ maxPosition: max(sets.position) })
      .from(sets)
      .where(eq(sets.sessionId, input.sessionId));
    const [row] = await tx
      .insert(sets)
      .values({
        sessionId: input.sessionId,
        equipmentVariantId: input.equipmentVariantId,
        weight: input.weight,
        reps: input.reps,
        rir: input.rir,
        position: (maxPosition ?? -1) + 1,
        loggedAt: new Date(),
        isWarmupOverride: null,
      })
      .returning();
    return row;
  });
}

export async function updateSet(
  db: Database,
  id: string,
  patch: Partial<{ weight: number; reps: number; rir: number; isWarmupOverride: boolean | null }>,
) {
  await db.update(sets).set(patch).where(eq(sets.id, id));
}

export async function deleteSet(db: Database, id: string) {
  await db.delete(sets).where(eq(sets.id, id));
}
