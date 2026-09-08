import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { getExercise, updateExercise } from '../../db/queries/exercises';
import { getSettings } from '../../db/queries/settings';
import type { Exercise, Settings } from '../../db/types';
import {
  resolveRestSeconds,
  resolveWeightIncrement,
  resolveRepFloor,
} from '../../lib/exerciseDefaults';
import { ExerciseForm } from '../../components/exercises/ExerciseForm';
import { ExerciseOverrideRow } from '../../components/exercises/ExerciseOverrideRow';

function formatMinutesSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [exerciseRow, settingsRow] = await Promise.all([getExercise(db, id), getSettings(db)]);
    setExercise(exerciseRow);
    setSettings(settingsRow);
    setLoading(false);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function applyOverride(patch: Partial<{ restSeconds: number | null; weightIncrement: number | null; repFloor: number | null }>) {
    if (!exercise) return;
    const updated = await updateExercise(db, exercise.id, patch);
    setExercise(updated);
  }

  if (loading || !exercise || !settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{exercise.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {exercise.isCustom ? (
          <ExerciseForm
            initialValues={{
              name: exercise.name,
              muscleGroup: exercise.muscleGroup,
              equipmentType: exercise.equipmentType,
            }}
            submitLabel="Save changes"
            onCancel={() => router.back()}
            onSubmit={async (values) => {
              const updated = await updateExercise(db, exercise.id, values);
              setExercise(updated);
              router.back();
            }}
          />
        ) : (
          <View style={styles.readOnlyBlock}>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Muscle group</Text>
              <Text style={styles.readOnlyValue}>{exercise.muscleGroup}</Text>
            </View>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Equipment type</Text>
              <Text style={styles.readOnlyValue}>{exercise.equipmentType}</Text>
            </View>
            <Text style={styles.readOnlyNote}>
              This is one of Notch's built-in exercises. Create a custom exercise if you want
              something different — the name and category here stay fixed.
            </Text>
          </View>
        )}

        <View style={styles.overridesSection}>
          <Text style={styles.overridesTitle}>Overrides for this exercise</Text>

          <ExerciseOverrideRow
            label="Rest timer"
            overrideValue={exercise.restSeconds}
            effectiveValue={resolveRestSeconds(exercise, settings)}
            step={15}
            min={15}
            formatValue={formatMinutesSeconds}
            onChange={(next) => applyOverride({ restSeconds: Math.round(next) })}
            onReset={() => applyOverride({ restSeconds: null })}
          />

          <ExerciseOverrideRow
            label="Weight increment (lb)"
            overrideValue={exercise.weightIncrement}
            effectiveValue={resolveWeightIncrement(exercise, settings)}
            step={0.5}
            min={0.5}
            onChange={(next) => applyOverride({ weightIncrement: next })}
            onReset={() => applyOverride({ weightIncrement: null })}
          />

          <ExerciseOverrideRow
            label="Rep floor"
            overrideValue={exercise.repFloor}
            effectiveValue={resolveRepFloor(exercise, settings)}
            step={1}
            min={1}
            onChange={(next) => applyOverride({ repFloor: Math.round(next) })}
            onReset={() => applyOverride({ repFloor: null })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backChevron: { fontSize: 22, color: colors.textSecondary, width: 22 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  content: { padding: 16 },
  readOnlyBlock: { marginBottom: 8 },
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  readOnlyLabel: { fontSize: 13, color: colors.textMuted },
  readOnlyValue: { fontSize: 14, color: colors.textPrimary },
  readOnlyNote: { fontSize: 12, color: colors.textMuted, marginTop: 12, lineHeight: 18 },
  overridesSection: { marginTop: 24 },
  overridesTitle: { fontSize: 12, color: colors.textMuted, marginBottom: 14 },
});
