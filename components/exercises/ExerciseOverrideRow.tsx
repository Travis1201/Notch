import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { NumberStepper } from '../session/NumberStepper';

interface Props {
  label: string;
  overrideValue: number | null; // raw stored value — null means "using the settings default"
  effectiveValue: number; // overrideValue ?? the resolved settings default
  step: number;
  min?: number;
  formatValue?: (value: number) => string;
  onChange: (next: number) => void;
  onReset: () => void;
}

// CLAUDE.md "Weight increments" / "Rep floor": "per-exercise override for anything
// unusual" — one editable row, shared by rest seconds / weight increment / rep floor
// on the exercise detail screen.
export function ExerciseOverrideRow({
  label,
  overrideValue,
  effectiveValue,
  step,
  min = 0,
  formatValue,
  onChange,
  onReset,
}: Props) {
  const isCustom = overrideValue !== null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.caption}>{isCustom ? 'custom' : 'default'}</Text>
          {isCustom && (
            <Pressable onPress={onReset} hitSlop={8}>
              <Text style={styles.resetLink}>Reset</Text>
            </Pressable>
          )}
        </View>
      </View>
      <NumberStepper
        value={effectiveValue}
        step={step}
        min={min}
        formatValue={formatValue}
        onChange={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  caption: { fontSize: 12, color: colors.textMuted },
  resetLink: { fontSize: 12, color: colors.accent },
});
