// THE session-duration rule, in one place. CLAUDE.md "Duration": calculated as last
// set timestamp minus first set timestamp — never close time minus start time, because
// users routinely forget to hit Finish and a session finalised the next morning must
// still read "52 min".
//
// Two callers, and they must agree: db/queries/sessions.ts `finishSession` computes
// the value it STORES, and the finish-confirmation screen shows a preview of it before
// the user commits. A preview computed by its own slightly different rule would tell
// the user "52 min" and then write something else into History.
export interface TimestampedSet {
  loggedAt: Date;
}

// Null for a session with no sets — there is no elapsed training time to report, which
// is different from reporting zero. Also null-ish by construction for a single set
// (0 seconds), which is correct: one set spans no interval.
export function computeDurationSeconds(sets: TimestampedSet[]): number | null {
  if (sets.length === 0) return null;
  const timestamps = sets.map((s) => s.loggedAt.getTime());
  return Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1000);
}

// Matches the History list's formatting. Sub-minute sessions read "under a minute"
// rather than "0 min", which would look like a bug on a workout that clearly happened.
export function formatDurationLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under a minute';
  return `${minutes} min`;
}
