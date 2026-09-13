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

// The MAGNITUDE of an improvement, for CLAUDE.md "Live PR feedback" stage 2 — the
// "+5 lb" / "+2 reps" that sits beside the arrow for the rest of a live session.
//
// Kept next to `didImprove` and gated on it, rather than living in a component,
// because the two have to agree by construction: a row that shows a delta without an
// arrow (or vice versa) would be the same class of self-contradiction CLAUDE.md's
// "put it in ONE named function" rule exists to prevent. Null whenever `didImprove`
// is false, so there is exactly one definition of "this beat last time."
export interface PrDelta {
  kind: 'weight' | 'reps';
  amount: number; // lb for 'weight' (convert at the display boundary), reps for 'reps'
}

// Which dimension moved follows the same precedence as `compareSets`: weight dominates.
// A heavier top set reports its weight gain even if the reps went DOWN — reporting
// "-1 rep" there would contradict the arrow the same row is showing, and by the app's
// own ordering rule the lift did improve. Reps are only reported when weight held
// steady, which is the only case in which reps decided the comparison.
export function describeImprovement(
  current: LoggedSet | null,
  previous: LoggedSet | null,
): PrDelta | null {
  if (!didImprove(current, previous)) return null;
  const now = current!;
  const before = previous!;
  if (now.weight > before.weight) {
    return { kind: 'weight', amount: now.weight - before.weight };
  }
  return { kind: 'reps', amount: now.reps - before.reps };
}

// At most one decimal, trailing ".0" dropped. Weight deltas are whole numbers in lb
// (the increment is 2.5, so "+2.5 lb" is real and must survive) but land on long
// fractions once converted to kg — "+2.3 kg", not "+2.2679618708 kg".
function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Formatting takes the unit conversion as a callback so this file stays unit-agnostic
// and keeps storing/reasoning in lb, per CLAUDE.md "Units": convert only at the UI
// boundary. Pluralisation of "rep" is called out explicitly in the spec.
export function formatPrDelta(
  delta: PrDelta,
  options: { toDisplayWeight: (lb: number) => number; unitLabel: string },
): string {
  if (delta.kind === 'weight') {
    return `+${trimNumber(options.toDisplayWeight(delta.amount))} ${options.unitLabel}`;
  }
  return `+${delta.amount} ${delta.amount === 1 ? 'rep' : 'reps'}`;
}
