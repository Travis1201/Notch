// Matches notch-ui-mockups.html's dark palette and CLAUDE.md's "Visual design >
// Color" section: a deep, desaturated accent blue; green reserved for progression
// only; neutral near-blacks/greys for everything else. Single dark theme — not
// user-toggleable and not system-adaptive (see app.json's userInterfaceStyle).
export const colors = {
  pageBg: '#0e0e10',
  surface1: '#1c1c1f',
  surface2: '#19191b',
  surface3: '#27272a',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  textPrimary: '#f2f2f0',
  textSecondary: '#a8a7a3',
  textMuted: '#77766f',
  textSuccess: '#6fbf3c',
  accent: '#2f7fd1',
  accentLight: '#9cc7ef',
  accentLighter: '#cfe4f8',
  accentTintBg: '#17263a',
} as const;
