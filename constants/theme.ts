import type { TextStyle } from 'react-native';

// Matches notch-ui-mockups.html's dark palette and CLAUDE.md's "Visual design >
// Color" section: a deep, desaturated accent blue; green reserved for progression
// only; neutral near-blacks/greys for everything else. Single dark theme — not
// user-toggleable and not system-adaptive (see app.json's userInterfaceStyle).
//
// The palette is locked (UI-changes.md). Depth comes from VALUE steps within it, not
// from new hues — a three-step tonal ladder, each step one notch lighter:
//
//   bg            app background: every screen, sheet, header and the tab bar
//   surface       a card or grouped block sitting on bg
//   surfaceRaised active / focused / selected: a working set row inside a card, a
//                 selected pill, a pressed row, a search field
//
// Before this ladder, screens were painted #19191b and cards #1c1c1f — close enough
// that a card didn't read as a separate plane at all.
export const colors = {
  bg: '#0e0e10',
  surface: '#1c1c1f',
  surfaceRaised: '#2a2a2e',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  textPrimary: '#f2f2f0',
  textSecondary: '#a8a7a3',
  textMuted: '#77766f',
  textSuccess: '#6fbf3c',
  textError: '#e0664f',
  // Fill colour for a destructive button (currently only "Discard workout"). A
  // genuine red, not textError's softer red-orange: that reads fine as *text* on a
  // dark ground but as a large filled button it looked orange rather than dangerous.
  // Saturation and lightness are matched to the accent blue so it belongs to the same
  // palette instead of shouting over it.
  danger: '#cf3328',
  accent: '#2f7fd1',
  accentLight: '#9cc7ef',
  accentLighter: '#cfe4f8',
  accentTintBg: '#17263a',
} as const;

// Corner radii by role, so a shape says what an element is: a card is visibly a
// different kind of object from a button, and a button from a row inside a card.
export const radii = {
  row: 8, // set rows, inputs, stepper controls, RIR pills
  button: 10, // standalone buttons
  card: 16, // exercise cards, hero card, grouped blocks
  pill: 999, // gym / date / brand pills
} as const;

// Numbers are the payoff of this app — weight, reps and RIR are what the user came to
// see — so they get their own scale, heavier than anything around them and always
// with tabular figures so a column of sets lines up digit for digit. Labels, headers
// and secondary text sit on the quieter `text` scale below so the eye lands on the
// numbers first.
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const numeric = {
  // Progress detail's "current best", the workout clock.
  display: { ...tabular, fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.5 },
  // Weight / reps being entered in a stepper.
  entry: { ...tabular, fontSize: 24, fontWeight: '700' },
  // A logged set's weight and reps.
  set: { ...tabular, fontSize: 18, fontWeight: '600' },
  // Inline numbers in a list row or summary (hero card, session lists, RIR).
  inline: { ...tabular, fontSize: 15, fontWeight: '600' },
  // Tiny numeric context: set index, counts beside an arrow.
  small: { ...tabular, fontSize: 12, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

export const text = {
  // Small uppercase field labels ("WEIGHT", "RIR", "LAST TIME"). Deliberately quiet.
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  // Exercise / card titles — smaller than the numbers inside the card.
  cardTitle: { fontSize: 16, fontWeight: '600' },
  // Secondary lines: brand, dates, meta.
  meta: { fontSize: 12 },
} satisfies Record<string, TextStyle>;
