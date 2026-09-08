import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/theme';
import { exerciseEquipmentTypes, type ExerciseEquipmentType } from '../../db/schema';

export interface ExerciseFormValues {
  name: string;
  muscleGroup: string;
  equipmentType: ExerciseEquipmentType;
}

interface Props {
  initialValues?: ExerciseFormValues;
  submitLabel?: string;
  onSubmit: (values: ExerciseFormValues) => void;
  onCancel: () => void;
}

// Shared create/edit form — used by the logging screen's add-exercise sheet, the
// Exercises tab's create modal, and a custom exercise's detail/edit screen.
export function ExerciseForm({ initialValues, submitLabel = 'Add exercise', onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState(initialValues?.muscleGroup ?? '');
  const [equipmentType, setEquipmentType] = useState<ExerciseEquipmentType>(
    initialValues?.equipmentType ?? 'machine',
  );

  const canSubmit = name.trim().length > 0 && muscleGroup.trim().length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Leg press"
        placeholderTextColor={colors.textMuted}
        autoFocus
      />
      <Text style={styles.fieldLabel}>Muscle group</Text>
      <TextInput
        style={styles.input}
        value={muscleGroup}
        onChangeText={setMuscleGroup}
        placeholder="e.g. Legs"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.fieldLabel}>Equipment type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        {exerciseEquipmentTypes.map((type) => (
          <Pressable
            key={type}
            onPress={() => setEquipmentType(type)}
            style={[styles.pill, equipmentType === type && styles.pillSelected]}
          >
            <Text style={[styles.pillText, equipmentType === type && styles.pillTextSelected]}>
              {type}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            canSubmit && onSubmit({ name: name.trim(), muscleGroup: muscleGroup.trim(), equipmentType })
          }
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          disabled={!canSubmit}
        >
          <Text style={styles.submitLabel}>{submitLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: colors.surface1, flex: 1 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
  },
  pillRow: { flexDirection: 'row' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginRight: 8,
  },
  pillSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontSize: 13, color: colors.textSecondary },
  pillTextSelected: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelButton: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 15, color: colors.textSecondary },
  submitButton: {
    flex: 2,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
