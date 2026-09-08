import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/theme';

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
// values; this component itself is unit-agnostic.
export function NumberStepper({ label, value, step, min = 0, onChange, formatValue }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commitDraft() {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    }
    setEditing(false);
  }

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
        {editing ? (
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Pressable
            style={styles.valueTapTarget}
            onPress={() => {
              setDraft(String(value));
              setEditing(true);
            }}
          >
            <Text style={styles.value}>{formatValue ? formatValue(value) : value}</Text>
          </Pressable>
        )}
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
  sign: { fontSize: 18, color: colors.textSecondary },
  valueTapTarget: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    padding: 0,
  },
});
