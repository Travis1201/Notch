import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import type { ClassifiedSet } from '../../lib/warmups';

interface Props {
  index: number; // 1-based, display only
  set: ClassifiedSet & { rir: number };
  isCurrentTopSet: boolean;
  improved: boolean;
  onToggleWarmup: () => void;
}

// CLAUDE.md "Warm-up sets": render greyed automatically via inference, tap to
// override. The green arrow (CLAUDE.md "The green up-arrow") only ever appears on
// the current top set, and only when it beat the previous session's top set.
export function SetRow({ index, set, isCurrentTopSet, improved, onToggleWarmup }: Props) {
  return (
    <Pressable
      style={[styles.row, !set.isWarmup && styles.rowHighlighted]}
      onPress={onToggleWarmup}
    >
      <Text style={[styles.index, set.isWarmup && styles.muted]}>{index}</Text>
      <Text style={[styles.reading, set.isWarmup && styles.muted]}>
        {set.weight} × {set.reps}
      </Text>
      {set.isWarmup ? (
        <Text style={styles.warmupLabel}>warm-up</Text>
      ) : (
        <Text style={styles.rirLabel}>{set.rir} RIR</Text>
      )}
      {isCurrentTopSet && improved ? <Text style={styles.arrow}>↗</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rowHighlighted: { backgroundColor: colors.surface3 },
  index: { fontSize: 12, color: colors.textSecondary, width: 14 },
  reading: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  muted: { color: colors.textMuted, fontWeight: '400' },
  warmupLabel: { fontSize: 11, color: colors.textMuted },
  rirLabel: { fontSize: 12, color: colors.textSecondary },
  arrow: { fontSize: 14, color: colors.textSuccess, marginLeft: 4 },
});
