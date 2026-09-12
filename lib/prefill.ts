// CLAUDE.md "Core design principle: confirm, don't input" — entry fields should
// almost always be pre-filled rather than empty.
//
// Position-based, not "always the top set": row N's reference is last session's Nth
// WORKING set (top set, then whatever back-off sets followed it — warm-ups already
// excluded by db/queries/sets.ts getLastSessionWorkingSets), so a set that dropped
// weight after the top set shows up as its own number instead of the top set's number
// repeated on every row. This is also what row N pre-fills from, so the user gets a
// real per-set starting point instead of doing the drop-off math by hand.
export interface PrefillSet {
  weight: number;
  reps: number;
  rir: number;
}

// Narrows to EXACTLY weight/reps/rir and never returns the source object itself.
//
// This is load-bearing, not tidiness. Callers pass full `sets` rows here (a prior
// session's rows, or one already logged this session) — and a DB row is structurally
// assignable to PrefillSet, so TypeScript happily let a fat object through, carrying
// `id`, `sessionId`, `position`, `loggedAt`... A draft built that way was later spread
// into logSet's input, where the stale `sessionId` overwrote the real one and every
// confirmed set got written into the PREVIOUS session — sets vanished from the current
// workout the moment anything re-read from the database. Rebuilding a clean object
// here is what stops a row's identity from ever riding along with its numbers.
export function toPrefillSet(source: PrefillSet): PrefillSet {
  return { weight: source.weight, reps: source.reps, rir: source.rir };
}

// `rowIndex` is a simple count of sets already logged this session for this variant
// (0 for the first set, 1 for the second, ...) — not itself warm-up-aware, since a
// set's warm-up status can retroactively change as later, heavier sets are logged
// this session (see CLAUDE.md Gotchas "Warm-up inference edge case"); trying to
// exclude live warm-ups from this count would make the index itself unstable mid-set.
// `lastWorkingSets` (the comparison side) has no such problem — it's computed once
// from an already-finished prior session.
export function resolvePrefillForRow(
  lastWorkingSets: PrefillSet[],
  rowIndex: number,
  mostRecentSetThisSession: PrefillSet | null,
): PrefillSet {
  const source = lastWorkingSets[rowIndex] ?? mostRecentSetThisSession;
  return source ? toPrefillSet(source) : { weight: 0, reps: 0, rir: 0 };
}
