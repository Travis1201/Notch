import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../constants/theme';
import { AddExerciseModal } from '../session/AddExerciseModal';
import type { Exercise } from '../../db/types';

export interface TemplateExerciseRef {
  exerciseId: string;
  name: string;
}

interface Props {
  initialName?: string;
  initialExercises?: TemplateExerciseRef[];
  submitLabel?: string;
  onSubmit: (values: { name: string; exerciseIds: string[] }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

// CLAUDE.md "Templates": "stores structure only — an ordered list of exercises."
// Reuses AddExerciseModal (already browsable + searchable + "create new") for adding
// exercises here, same as the mid-workout add flow — one picker, two callers.
export function TemplateForm({
  initialName = '',
  initialExercises = [],
  submitLabel = 'Save template',
  onSubmit,
  onCancel,
  onDelete,
}: Props) {
  const [name, setName] = useState(initialName);
  const [exercises, setExercises] = useState<TemplateExerciseRef[]>(initialExercises);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSubmit = name.trim().length > 0 && exercises.length > 0 && !saving;

  function addExercise(exercise: Exercise) {
    setExercises((prev) => (prev.some((e) => e.exerciseId === exercise.id) ? prev : [...prev, { exerciseId: exercise.id, name: exercise.name }]));
    setPickerVisible(false);
  }

  function removeExercise(exerciseId: string) {
    setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
  }

  function move(exerciseId: string, direction: 'up' | 'down') {
    setExercises((prev) => {
      const idx = prev.findIndex((e) => e.exerciseId === exerciseId);
      const swapWith = direction === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), exerciseIds: exercises.map((e) => e.exerciseId) });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!onDelete) return;
    Alert.alert('Delete template?', `"${initialName}" will be removed. Past sessions logged from it are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Push day"
          placeholderTextColor={colors.textMuted}
          autoFocus={!initialName}
        />

        <Text style={styles.fieldLabel}>Exercises</Text>
        {exercises.length === 0 && (
          <Text style={styles.emptyText}>Add at least one exercise below.</Text>
        )}
        <View style={styles.exerciseList}>
          {exercises.map((e, index) => (
            <View key={e.exerciseId} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{e.name}</Text>
              <View style={styles.exerciseActions}>
                <Pressable
                  hitSlop={6}
                  disabled={index === 0}
                  onPress={() => move(e.exerciseId, 'up')}
                  style={styles.moveButton}
                >
                  <Text style={[styles.moveLabel, index === 0 && styles.disabled]}>↑</Text>
                </Pressable>
                <Pressable
                  hitSlop={6}
                  disabled={index === exercises.length - 1}
                  onPress={() => move(e.exerciseId, 'down')}
                  style={styles.moveButton}
                >
                  <Text style={[styles.moveLabel, index === exercises.length - 1 && styles.disabled]}>
                    ↓
                  </Text>
                </Pressable>
                <Pressable hitSlop={6} onPress={() => removeExercise(e.exerciseId)}>
                  <Feather name="x" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.addRow} onPress={() => setPickerVisible(true)}>
          <Feather name="plus" size={15} color={colors.accent} />
          <Text style={styles.addLabel}>Add exercise</Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            disabled={!canSubmit}
          >
            <Text style={styles.submitLabel}>{saving ? 'Saving…' : submitLabel}</Text>
          </Pressable>
        </View>

        {onDelete && (
          <Pressable style={styles.deleteRow} onPress={handleDelete}>
            <Text style={styles.deleteLabel}>Delete template</Text>
          </Pressable>
        )}
      </ScrollView>

      <AddExerciseModal visible={pickerVisible} onClose={() => setPickerVisible(false)} onSelect={addExercise} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  emptyText: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  exerciseList: { gap: 2 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 4,
  },
  exerciseName: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  exerciseActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  moveButton: { paddingHorizontal: 2 },
  moveLabel: { fontSize: 15, color: colors.textSecondary },
  disabled: { color: colors.border },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addLabel: { fontSize: 14, color: colors.accent, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 28 },
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
  deleteRow: { alignItems: 'center', marginTop: 20, padding: 10 },
  deleteLabel: { fontSize: 13, color: colors.textError },
});
