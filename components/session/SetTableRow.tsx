import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../constants/theme';

interface Props {
  index: number; // 1-based, display only
  weight: number; // lb
  reps: number;
  rir: number;
  isWarmup: boolean;
  isCurrentTopSet: boolean;
  improved: boolean;
  formatWeight: (lb: number) => number;
  onOpenEdit: () => void;
  onToggleWarmup: () => void;
}

// One already-logged set, styled to notch-ui-mockups.png's set list: a muted index
// cell, "230 × 7" as the row's body, and RIR (or the word "warm-up") trailing. A
// working set sits on a surface3 pill; an inferred warm-up is greyed with no fill,
// which is exactly CLAUDE.md's "render greyed out" requirement — the styling and the
// mockup agree here, so nothing had to be traded off.
//
// There is no Previous column. The mockup carries last session's numbers ONCE per
// exercise, in the accent-tinted "Last time · Aug 31" block above this list, rather
// than repeating a per-row reference; CLAUDE.md only requires that "what did I do
// last time" be visible within the relevant exercise's section, which that block
// satisfies without spending a column of a phone-width row on it.
//
// There is also no delete button, and no swipe-to-delete: the row is a single tap
// target that opens EditSetModal, which is where both correcting and deleting the set
// live. That keeps the row visually identical to the mockup, keeps one tap target per
// row instead of four competing ones under a thumb, and avoids a gesture library —
// a swipe built on react-native-gesture-handler's Swipeable previously caused this
// whole screen to fail to render (Reanimated 4 incompatibility).
//
// CLAUDE.md "Active workout screen": "Every logged set remains editable for the life
// of the session... logged is never the same as locked." Tap opens the editor; a long
// press is the warm-up-inference override (CLAUDE.md "Warm-up sets": "Tap to
// override"), which needs to reach sets both before and after the top set so a
// back-off set can be dimmed explicitly.
export function SetTableRow({
  index,
  weight,
  reps,
  rir,
  isWarmup,
  isCurrentTopSet,
  improved,
  formatWeight,
  onOpenEdit,
  onToggleWarmup,
}: Props) {
  return (
    <Pressable
      style={[styles.row, !isWarmup && styles.rowWorking]}
      onPress={onOpenEdit}
      onLongPress={onToggleWarmup}
      delayLongPress={350}
      hitSlop={4}
    >
      <Text style={[styles.index, isWarmup && styles.mutedText]}>{index}</Text>

      <Text style={[styles.value, isWarmup && styles.mutedValue]}>
        {formatWeight(weight)} × {reps}
      </Text>

      {isWarmup ? (
        <Text style={styles.warmupLabel}>warm-up</Text>
      ) : (
        <Text style={styles.rirLabel}>{rir >= 4 ? '4+' : rir} RIR</Text>
      )}

      {/* Green arrow on the session's own top set when it beat last session's — the
          one place on this row where colour carries meaning. A flat session shows
          nothing at all, never a red arrow or a "0" (CLAUDE.md "The green
          up-arrow"), so the spacer keeps rows aligned without implying a verdict. */}
      {isCurrentTopSet && improved ? (
        <Feather name="arrow-up-right" size={14} color={colors.textSuccess} />
      ) : (
        <View style={styles.arrowSpacer} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rowWorking: { backgroundColor: colors.surface3 },
  index: { fontSize: 12, color: colors.textSecondary, width: 14 },
  value: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  mutedValue: { color: colors.textMuted, fontWeight: '400' },
  mutedText: { color: colors.textMuted },
  warmupLabel: { fontSize: 11, color: colors.textMuted },
  rirLabel: { fontSize: 12, color: colors.textSecondary },
  arrowSpacer: { width: 14 },
});
