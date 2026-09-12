// CLAUDE.md "Visual design > Color": "Per-template colour dots identify training
// days at a glance," but also "Green (--text-success) is reserved for progression
// indicators only" and the palette is otherwise deliberately restrained (accent blue
// + neutral greys). Templates have no color column (CLAUDE.md's data model lists
// only id/name) and are not user-colorable in v1, so dots are assigned deterministically
// from a small fixed palette of muted, non-green, non-accent hues — same template
// always gets the same dot, no color picker needed.
const TEMPLATE_DOT_COLORS = ['#c17d4f', '#8f6fbf', '#4f9dc1', '#bf5f7d', '#a89a4f'] as const;

export function templateDotColor(templateId: string): string {
  let hash = 0;
  for (let i = 0; i < templateId.length; i++) {
    hash = (hash * 31 + templateId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TEMPLATE_DOT_COLORS.length;
  return TEMPLATE_DOT_COLORS[index];
}
