import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { useActiveSessionStore } from '../../store/activeSessionStore';
import { useRestTimerNotifications } from '../../hooks/useRestTimerNotifications';
import { ActiveExercisePanel } from '../../components/session/ActiveExercisePanel';
import { RestTimerBar } from '../../components/session/RestTimerBar';
import { ExercisesSheet } from '../../components/session/ExercisesSheet';
import { AddExerciseModal } from '../../components/session/AddExerciseModal';

function formatElapsed(startedAt: Date, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ActiveSessionScreen() {
  useKeepAwake(); // CLAUDE.md Gotchas: keep screen awake during an active workout
  useRestTimerNotifications();

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();

  const isHydrated = useActiveSessionStore((s) => s.isHydrated);
  const sessionDate = useActiveSessionStore((s) => s.date);
  const exercises = useActiveSessionStore((s) => s.exercises);
  const currentSessionExerciseId = useActiveSessionStore((s) => s.currentSessionExerciseId);
  const loadSession = useActiveSessionStore((s) => s.loadSession);
  const skipExercise = useActiveSessionStore((s) => s.skipExercise);
  const unskipExercise = useActiveSessionStore((s) => s.unskipExercise);
  const reorderExercises = useActiveSessionStore((s) => s.reorderExercises);
  const setCurrentExercise = useActiveSessionStore((s) => s.setCurrentExercise);
  const addExercise = useActiveSessionStore((s) => s.addExercise);
  const finish = useActiveSessionStore((s) => s.finish);
  const reset = useActiveSessionStore((s) => s.reset);

  const [exercisesSheetVisible, setExercisesSheetVisible] = useState(false);
  const [addExerciseModalVisible, setAddExerciseModalVisible] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (id) loadSession(db, id);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const pendingExercises = useMemo(
    () => exercises.filter((e) => e.status === 'pending'),
    [exercises],
  );
  const currentExercise = exercises.find((e) => e.id === currentSessionExerciseId) ?? null;
  const currentIndex = currentExercise ? exercises.indexOf(currentExercise) : -1;
  const nextPending = pendingExercises.find(
    (e) => currentExercise === null || e.position > currentExercise.position,
  );

  async function handleAdvance() {
    if (nextPending) await setCurrentExercise(db, nextPending.id);
  }

  async function handleFinish() {
    setExercisesSheetVisible(false);
    await finish(db);
    router.replace('/(tabs)');
  }

  if (!isHydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerLeft} onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.headerTitle}>Workout</Text>
        </Pressable>
        <View style={styles.headerRight}>
          {sessionDate && <Text style={styles.elapsed}>{formatElapsed(sessionDate, now)}</Text>}
          <Pressable onPress={() => setExercisesSheetVisible(true)} hitSlop={8}>
            <Text style={styles.headerAction}>Exercises</Text>
          </Pressable>
        </View>
      </View>

      {currentExercise ? (
        <ActiveExercisePanel
          key={currentExercise.id}
          sessionExercise={currentExercise}
          indexInList={currentIndex + 1}
          totalCount={exercises.length}
          hasNext={!!nextPending}
          onAdvance={handleAdvance}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No exercise selected</Text>
          <Text style={styles.emptyBody}>Add an exercise to get started.</Text>
          <Pressable style={styles.emptyAddButton} onPress={() => setAddExerciseModalVisible(true)}>
            <Text style={styles.emptyAddLabel}>+ Add exercise</Text>
          </Pressable>
        </View>
      )}

      <RestTimerBar />

      <ExercisesSheet
        visible={exercisesSheetVisible}
        onClose={() => setExercisesSheetVisible(false)}
        exercises={exercises}
        currentSessionExerciseId={currentSessionExerciseId}
        onJumpTo={(exerciseId) => {
          setCurrentExercise(db, exerciseId);
          setExercisesSheetVisible(false);
        }}
        onSkip={(exerciseId) => skipExercise(db, exerciseId)}
        onUnskip={(exerciseId) => unskipExercise(db, exerciseId)}
        onMove={(exerciseId, direction) => {
          const ids = exercises.map((e) => e.id);
          const idx = ids.indexOf(exerciseId);
          const swapWith = direction === 'up' ? idx - 1 : idx + 1;
          if (swapWith < 0 || swapWith >= ids.length) return;
          [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
          reorderExercises(db, ids);
        }}
        onAddExercise={() => {
          setExercisesSheetVisible(false);
          setAddExerciseModalVisible(true);
        }}
        onFinish={handleFinish}
      />

      <AddExerciseModal
        visible={addExerciseModalVisible}
        onClose={() => setAddExerciseModalVisible(false)}
        onSelect={async (exercise) => {
          await addExercise(db, exercise.id, exercise.name);
          setAddExerciseModalVisible(false);
        }}
      />
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backChevron: { fontSize: 22, color: colors.textSecondary, marginTop: -2 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  elapsed: { fontSize: 13, color: colors.textMuted },
  headerAction: { fontSize: 13, color: colors.accent, fontWeight: '500' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  emptyBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyAddButton: {
    marginTop: 12,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
