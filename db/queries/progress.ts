import { eq } from 'drizzle-orm';

import type { Database } from '../client';
import { sets } from '../schema';
import { selectTopSet } from '../../lib/progression';
import { resolveRepFloor } from '../../lib/exerciseDefaults';
import { getSettings } from './settings';
import { getExercise } from './exercises';
import { getEquipmentVariant } from './equipmentVariants';
import type { Set as SetRow, Settings } from '../types';

export interface TrackedVariantSummary {
  variantId: string;
  exerciseId: string;
  exerciseName: string;
  brand: string | null;
  gymId: string;
  gymName: string;
  lastSessionDate: Date;
  sessionCount: number;
}

// Progress tab's landing list — CLAUDE.md "Progress tab": "a searchable list of
// tracked lifts, sorted by most recently trained" and "Variants with only one or two
// logged sessions shouldn't appear until there's enough data to plot." Modest data
// volumes for a personal tracker, so this reads everything and groups/filters in JS
// rather than a hand-tuned SQL aggregate — simpler to keep correct.
export async function listTrackedVariants(db: Database): Promise<TrackedVariantSummary[]> {
  const allSets = await db.query.sets.findMany();
  if (allSets.length === 0) return [];

  const byVariant = new Map<string, { sessionIds: Set<string>; lastDate: Date }>();
  const sessionDateCache = new Map<string, Date | null>();

  for (const s of allSets) {
    let sessionDate = sessionDateCache.get(s.sessionId);
    if (sessionDate === undefined) {
      const session = await db.query.sessions.findFirst({ where: (row, { eq: eqOp }) => eqOp(row.id, s.sessionId) });
      sessionDate = session && session.status === 'complete' ? session.date : null;
      sessionDateCache.set(s.sessionId, sessionDate);
    }
    if (!sessionDate) continue;

    const entry = byVariant.get(s.equipmentVariantId);
    if (entry) {
      entry.sessionIds.add(s.sessionId);
      if (sessionDate > entry.lastDate) entry.lastDate = sessionDate;
    } else {
      byVariant.set(s.equipmentVariantId, { sessionIds: new Set([s.sessionId]), lastDate: sessionDate });
    }
  }

  const summaries: TrackedVariantSummary[] = [];
  for (const [variantId, { sessionIds, lastDate }] of byVariant) {
    if (sessionIds.size < 2) continue;
    const variant = await getEquipmentVariant(db, variantId);
    if (!variant) continue;
    const exercise = await getExercise(db, variant.exerciseId);
    if (!exercise) continue;
    const gymRow = await db.query.gyms.findFirst({ where: (g, { eq: eqOp }) => eqOp(g.id, variant.gymId) });
    summaries.push({
      variantId,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      brand: variant.brand,
      gymId: variant.gymId,
      gymName: gymRow?.name ?? '',
      lastSessionDate: lastDate,
      sessionCount: sessionIds.size,
    });
  }

  return summaries.sort((a, b) => b.lastSessionDate.getTime() - a.lastSessionDate.getTime());
}

export interface VariantSessionPoint {
  sessionId: string;
  date: Date;
  topSet: SetRow | null;
}

// One point per session that has sets on this variant, oldest first — CLAUDE.md
// "Progress tab": chart plots weight only, via the one shared top-set function.
export async function getVariantSessionHistory(
  db: Database,
  variantId: string,
): Promise<VariantSessionPoint[]> {
  const variant = await getEquipmentVariant(db, variantId);
  if (!variant) return [];
  const exercise = await getExercise(db, variant.exerciseId);
  const settings: Settings = await getSettings(db);
  const repFloor = exercise ? resolveRepFloor(exercise, settings) : 1;

  const variantSets = await db.query.sets.findMany({ where: eq(sets.equipmentVariantId, variantId) });
  const bySession = new Map<string, SetRow[]>();
  for (const s of variantSets) {
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }

  const points: VariantSessionPoint[] = [];
  for (const [sessionId, sessionSets] of bySession) {
    const session = await db.query.sessions.findFirst({
      where: (row, { eq: eqOp, and: andOp }) => andOp(eqOp(row.id, sessionId), eqOp(row.status, 'complete')),
    });
    if (!session) continue;
    points.push({ sessionId, date: session.date, topSet: selectTopSet(sessionSets, repFloor) });
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}
