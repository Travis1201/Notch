import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { NumericField } from '../shared/NumericField';

interface Props {
  label?: string;
  value: number;
  step: number;
  min?: number;
  onChange: (next: number) => void;
  formatValue?: (value: number) => string;
}

// Shared shape for weight and rep entry — CLAUDE.md "Logging screen": +/- steppers,
// tap the number for direct entry (decimal-pad). 2.5 lb / 1 rep are the callers' step
// values; this component itself is unit-agnostic. The tap-to-edit center value is
// NumericField — see that component for the stale-zero bug fix.
export function NumberStepper({ label, value, step, min = 0, onChange, formatValue }: Props) {
  return (
    <View style={styles.column}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.control}>
        <Pressable
          style={styles.tapTarget}
          hitSlop={8}
          onPress={() => onChange(Math.max(min, value - step))}
        >
          <Text style={styles.sign}>−</Text>
        </Pressable>
        <NumericField
          value={value}
          onChange={onChange}
          min={min}
          formatValue={formatValue}
          containerStyle={styles.valueTapTarget}
          textStyle={styles.value}
        />
        <Pressable style={styles.tapTarget} hitSlop={8} onPress={() => onChange(value + step)}>
          <Text style={styles.sign}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    height: 44,
  },
  tapTarget: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sign: { fontSize: 16, color: colors.textSecondary },
  valueTapTarget: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 17, fontWeight: '500', color: colors.textPrimary, textAlign: 'center' },
});
