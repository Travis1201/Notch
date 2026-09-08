// CLAUDE.md "Core design principle: confirm, don't input" — entry fields should
// almost always be pre-filled rather than empty. Deliberately simple: the first set of
// an exercise this session anchors to last session's top set (weight, reps, AND RIR —
// "RIR is a row of five tap targets... defaulting to last session's value"); every set
// after that just carries forward the set logged immediately before it this session.
// This mirrors "the stepper always adjusts a pre-filled value" (Weight increments) —
// continuity from one number, not a set-by-set replay of last session's entire list.
export interface PrefillSet {
  weight: number;
  reps: number;
  rir: number;
}

export function resolveFirstSetPrefill(lastSessionTopSet: PrefillSet | null): PrefillSet | null {
  return lastSessionTopSet;
}

export function resolveNextSetPrefill(setsLoggedThisSession: PrefillSet[]): PrefillSet | null {
  if (setsLoggedThisSession.length === 0) return null;
  return setsLoggedThisSession[setsLoggedThisSession.length - 1];
}
