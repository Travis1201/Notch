import { selectTopSet, type LoggedSet } from './progression';

// CLAUDE.md "Warm-up sets": any set logged before the top set, at a weight below the
// top set, in the same exercise, is a warm-up — rendered greyed, tap to override.
export interface SetForClassification extends LoggedSet {
  position: number; // session-global monotonic order — see db/schema.ts `sets.position`
  isWarmupOverride: boolean | null; // null = infer; non-null always wins
}

export interface ClassifiedSet extends SetForClassification {
  isWarmup: boolean;
}

// Caller must pre-filter `sets` to one session + one equipmentVariantId (e.g. a
// single entry of activeSessionStore's setsByEquipmentVariantId).
//
// Back-off-set decision (CLAUDE.md's Gotchas section calls this out by name as
// something to decide explicitly, not silently resolve): a set logged AFTER the top
// set defaults to NOT a warm-up regardless of its weight — it reads as a real working
// set, matching gym terminology. This has zero effect on progression math either way,
// since selectTopSet never consults isWarmup. The override tap is available on every
// set row, before or after the top set, so a user who wants a lighter back-off set
// dimmed can say so explicitly.
export function classifyWarmups(sets: SetForClassification[]): ClassifiedSet[] {
  const topSet = selectTopSet(sets, 1);
  return sets.map((s) => {
    if (s.isWarmupOverride !== null) {
      return { ...s, isWarmup: s.isWarmupOverride };
    }
    const isWarmup = topSet !== null && s.position < topSet.position && s.weight < topSet.weight;
    return { ...s, isWarmup };
  });
}
