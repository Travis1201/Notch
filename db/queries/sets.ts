import { and, eq, ne, lte, desc, max } from 'drizzle-orm';

import type { Database } from '../client';
import { sets, sessions } from '../schema';
import { selectTopSet, didImprove } from '../../lib/progression';
import { classifyWarmups } from '../../lib/warmups';
import { resolveRepFloor } from '../../lib/exerciseDefaults';
import { getSettings } from './settings';
import { getEquipmentVariant } from './equipmentVariants';
import { getExercise } from './exercises';
import type { Set as SetRow } from '../types';

export async function listSetsForSession(db: Database, sessionId: string) {
  return db.query.sets.findMany({
    where: (s, { eq }) => eq(s.sessionId, sessionId),
    orderBy: (s, { asc }) => asc(s.position),
  });
}

// Shared by getLastSessionTopSet, getLastSessionWorkingSets, and the home screen's
// hero card — all need "the most recent session (optionally before a given date, and
// excluding a given session) with at least one set on this equipment variant."
//
// `beforeDate` matters for correctness, not just the live workout: "most recent OTHER
// session" is only equivalent to "most recent PRIOR session" when the excluded
// session is itself the newest one (true for the live in-progress session, since
// nothing is logged after it yet). Viewing an OLD session in History and excluding
// only by ID would let this match a LATER session, comparing a past workout against
// the future — CLAUDE.md "The green up-arrow" requires this be computed identically
// everywhere, so it has to be right for History too, not just the live screen.
//
// The date bound is INCLUSIVE (<=), not strict (<): drizzle's sqlite `timestamp` mode
// truncates to whole SECONDS (Math.floor(ms / 1000) — see
// node_modules/drizzle-orm/sqlite-core/columns/integer.*), so two sessions created
// within the same second (e.g. finishing one and immediately starting the next while
// testing) get identical stored dates. A strict `<` would then exclude the real
// previous session entirely, and every pre-fill / green-arrow lookup would come back
// empty — draft rows silently falling back to their zero default ("reverting to
// 0's"). `excludeSessionId` (via `ne`) is what actually keeps this from matching the
// reference session itself, so relaxing the date bound to <= is safe.
async function findMostRecentSessionSets(
  db: Database,
  equipmentVariantId: string,
  opts: { excludeSessionId?: string; beforeDate?: Date } = {},
): Promise<SetRow[]> {
  const conditions = [eq(sets.equipmentVariantId, equipmentVariantId)];
  if (opts.excludeSessionId) conditions.push(ne(sets.sessionId, opts.excludeSessionId));
  if (opts.beforeDate) conditions.push(lte(sessions.date, opts.beforeDate));

  const rows = await db
    .select({ sessionId: sets.sessionId, sessionDate: sessions.date })
    .from(sets)
    .innerJoin(sessions, eq(sets.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.date))
    .limit(1);

  const lastSessionId = rows[0]?.sessionId;
  if (!lastSessionId) return [];

  const lastSets = await db.query.sets.findMany({
    where: (s, { eq }) => eq(s.sessionId, lastSessionId),
  });
  return lastSets
    .filter((s) => s.equipmentVariantId === equipmentVariantId)
    .sort((a, b) => a.position - b.position);
}

// Returns the prior session's top set (per lib/progression's selectTopSet — the one
// required source of truth), full row including RIR. Feeds the green arrow.
// `referenceDate` is the viewing session's own date — see findMostRecentSessionSets.
export async function getLastSessionTopSet(
  db: Database,
  equipmentVariantId: string,
  excludeSessionId: string,
  repFloor: number,
  referenceDate: Date,
): Promise<SetRow | null> {
  const forThisVariant = await findMostRecentSessionSets(db, equipmentVariantId, {
    excludeSessionId,
    beforeDate: referenceDate,
  });
  return selectTopSet(forThisVariant, repFloor);
}

// Same idea, no "current session" to exclude and no date bound — the home screen's
// hero card, showing "last session's top set beside each" of a template's exercises
// (CLAUDE.md "Home screen"), isn't running inside a session and always wants the most
// recent data available, full stop.
export async function getLatestTopSet(
  db: Database,
  equipmentVariantId: string,
  repFloor: number,
): Promise<SetRow | null> {
  const forThisVariant = await findMostRecentSessionSets(db, equipmentVariantId);
  return selectTopSet(forThisVariant, repFloor);
}

// Returns the prior session's sets on this variant, warm-ups excluded, in the order
// they were logged (top set first, then any back-off sets) — this is the "per set,
// not just the top set" reference data the active-workout screen's Previous column
// shows next to each of today's rows, and what today's not-yet-logged draft row
// pre-fills from (see lib/prefill.ts). Warm-ups are excluded here — on the static,
// already-finished prior session — rather than live during today's session, where a
// set's warm-up classification can still retroactively change as later, heavier sets
// are logged (see CLAUDE.md Gotchas "Warm-up inference edge case").
export async function getLastSessionWorkingSets(
  db: Database,
  equipmentVariantId: string,
  excludeSessionId: string,
  referenceDate: Date,
): Promise<SetRow[]> {
  const forThisVariant = await findMostRecentSessionSets(db, equipmentVariantId, {
    excludeSessionId,
    beforeDate: referenceDate,
  });
  return classifyWarmups(forThisVariant)
    .filter((s) => !s.isWarmup)
    .map(({ isWarmup, ...s }) => s as SetRow);
}

export interface LogSetInput {
  sessionId: string;
  equipmentVariantId: string;
  weight: number;
  reps: number;
  rir: number;
}

// Compile-time guard against handing this a WIDER object than it asks for. A `sets`
// row is structurally assignable to LogSetInput, so TypeScript would otherwise
// happily accept one — and it did: a pre-filled draft that was secretly a full row
// from the PREVIOUS session got spread into this input, its stale `sessionId`
// overwrote the real one, and every confirmed set was filed under the wrong workout
// (sets silently vanishing from the current session). Mapping any extra key to
// `never` turns that into a compile error at the call site instead of data loss at
// runtime.
type NoExtraKeys<T, Shape> = T & { [K in Exclude<keyof T, keyof Shape>]: never };

// No isWarmupOverride param — CLAUDE.md explicitly forbids a warm-up/working toggle
// at entry time. Always null on insert; only settable afterward via updateSet.
export async function logSet<T extends LogSetInput>(
  db: Database,
  input: NoExtraKeys<T, LogSetInput>,
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

// THE green-arrow count for a whole session — CLAUDE.md "The green up-arrow": "The
// definition must be computed identically everywhere it appears (logging screen,
// home, history). Put it in one shared function." This is that function for a
// finished session as a whole (home screen's "Pull day ↗2" template rows): for each
// equipment variant logged in the session, resolve that exercise's rep floor, select
// its top set (lib/progression.selectTopSet), and compare against the top set from
// the last OTHER session on that variant (same rule ExerciseCard uses live, applied
// retroactively here to an already-finished session).
export async function getSessionImprovementCount(db: Database, sessionId: string): Promise<number> {
  const session = await db.query.sessions.findFirst({ where: (s, { eq: eqOp }) => eqOp(s.id, sessionId) });
  if (!session) return 0;
  const sessionSets = await listSetsForSession(db, sessionId);
  if (sessionSets.length === 0) return 0;

  const settings = await getSettings(db);
  const byVariant = new Map<string, SetRow[]>();
  for (const s of sessionSets) {
    const list = byVariant.get(s.equipmentVariantId);
    if (list) list.push(s);
    else byVariant.set(s.equipmentVariantId, [s]);
  }

  let count = 0;
  for (const [variantId, variantSets] of byVariant) {
    const variant = await getEquipmentVariant(db, variantId);
    if (!variant) continue;
    const exercise = await getExercise(db, variant.exerciseId);
    if (!exercise) continue;
    const repFloor = resolveRepFloor(exercise, settings);
    const topSet = selectTopSet(variantSets, repFloor);
    const previousTopSet = await getLastSessionTopSet(db, variantId, sessionId, repFloor, session.date);
    if (didImprove(topSet, previousTopSet)) count++;
  }
  return count;
}
