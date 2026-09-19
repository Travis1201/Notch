import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, numeric, radii, text } from '../../constants/theme';

const OPTIONS = [0, 1, 2, 3, 4] as const; // "4+" stores literal 4 — CLAUDE.md "Logging screen"

interface Props {
  value: number;
  onChange: (rir: number) => void;
  showLabel?: boolean;
}

export function RirSelector({ value, onChange, showLabel = true }: Props) {
  return (
    <View>
      {showLabel && <Text style={styles.label}>RIR</Text>}
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const selected = value === option || (option === 4 && value >= 4);
          return (
            <Pressable
              key={option}
              style={[styles.target, selected && styles.targetSelected]}
              onPress={() => onChange(option)}
            >
              <Text style={[styles.targetText, selected && styles.targetTextSelected]}>
                {option === 4 ? '4+' : option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...text.label, color: colors.textMuted, marginBottom: 5 },
  row: { flexDirection: 'row', gap: 5 },
  target: {
    flex: 1,
    height: 38,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radii.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetSelected: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  targetText: { ...numeric.inline, fontWeight: '500', color: colors.textMuted },
  targetTextSelected: { fontWeight: '700', color: colors.textPrimary },
});
