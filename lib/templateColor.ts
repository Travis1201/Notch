import { templateDots } from '../constants/theme';

// CLAUDE.md "Visual design > Color": "Per-template colour dots identify training
// days at a glance," but also "Green (--text-success) is reserved for progression
// indicators only" and the palette is otherwise deliberately restrained. Templates
// have no color column (CLAUDE.md's data model lists only id/name) and are not
// user-colorable in v1, so dots are assigned deterministically from a small fixed
// palette — same template always gets the same dot, no color picker needed.
//
// The hues themselves live in constants/theme.ts: which colours read as "muted,
// not green, not the accent" depends entirely on what the accent currently is, so
// they belong with the palette rather than with this hashing.
export function templateDotColor(templateId: string): string {
  let hash = 0;
  for (let i = 0; i < templateId.length; i++) {
    hash = (hash * 31 + templateId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % templateDots.length;
  return templateDots[index];
}
