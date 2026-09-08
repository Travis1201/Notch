// THE top-set selection function. Per CLAUDE.md "Progression": the chart, the green
// arrow, PR detection, and goal checks must all call this — never re-derive the rule.
export interface LoggedSet {
  id: string;
  weight: number; // lb
  reps: number;
}

// >0 if a beats b, <0 if a is worse, 0 if tied. Heavier wins; equal weight, more reps wins.
export function compareSets(a: LoggedSet, b: LoggedSet): number {
  if (a.weight !== b.weight) return a.weight - b.weight;
  return a.reps - b.reps;
}

// repFloor filters to sets meeting a minimum rep count before selecting the top set —
// see CLAUDE.md "Rep floor (planned, not v1)". Default of 1 reproduces v1 behavior
// exactly (heaviest set, no filter), so this is a read-time filter, not a schema
// decision, and needs no rework when a real floor default ships later.
//
// Runs on the raw set list, not a warm-up-filtered one: a warm-up is by definition
// lighter than the top set, so the top set itself can never be classified as a
// warm-up. Warm-up exclusion "from all progression calculations" falls out of the
// comparison rule for free — no separate filter step is needed.
export function selectTopSet<T extends LoggedSet>(sets: T[], repFloor: number = 1): T | null {
  const eligible = sets.filter((s) => s.reps >= repFloor);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, s) => (compareSets(s, best) > 0 ? s : best));
}

// THE green-arrow function. CLAUDE.md "The green up-arrow": must be computed
// identically everywhere it appears. True iff both top sets exist and current beats
// previous — a session with zero improvements (either null) shows nothing, not a "0".
export function didImprove(current: LoggedSet | null, previous: LoggedSet | null): boolean {
  if (!current || !previous) return false;
  return compareSets(current, previous) > 0;
}
