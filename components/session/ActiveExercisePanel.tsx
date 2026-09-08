import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { getExercise } from '../../db/queries/exercises';
import { getSettings } from '../../db/queries/settings';
import type { Exercise, Settings } from '../../db/types';
import {
  useActiveSessionStore,
  EMPTY_SETS,
  type SessionExerciseVM,
} from '../../store/activeSessionStore';
import { useRestTimerStore } from '../../store/restTimerStore';
import { selectTopSet, didImprove } from '../../lib/progression';
import { classifyWarmups } from '../../lib/warmups';
import { resolveFirstSetPrefill, resolveNextSetPrefill, type PrefillSet } from '../../lib/prefill';
import {
  resolveRestSeconds,
  resolveWeightIncrement,
  resolveRepFloor,
} from '../../lib/exerciseDefaults';
import { fromLb, toLb, roundToStep } from '../../lib/units';
import { NumberStepper } from './NumberStepper';
import { RirSelector } from './RirSelector';
import { SetRow } from './SetRow';
import { EquipmentBrandPicker } from '../exercises/EquipmentBrandPicker';

interface Props {
  sessionExercise: SessionExerciseVM;
  indexInList: number; // 1-based
  totalCount: number;
  hasNext: boolean;
  onAdvance: () => void;
}

const FALLBACK_DRAFT: PrefillSet = { weight: 0, reps: 0, rir: 0 };

export function ActiveExercisePanel({
  sessionExercise,
  indexInList,
  totalCount,
  hasNext,
  onAdvance,
}: Props) {
  const db = useDatabase();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<PrefillSet>(FALLBACK_DRAFT);
  const [isLogging, setIsLogging] = useState(false);
  const [brandPickerVisible, setBrandPickerVisible] = useState(false);

  const setsThisSession = useActiveSessionStore(
    (s) => s.setsByEquipmentVariantId[sessionExercise.equipmentVariantId] ?? EMPTY_SETS,
  );
  const lastTopSet = useActiveSessionStore(
    (s) => s.lastTopSetByEquipmentVariantId[sessionExercise.equipmentVariantId],
  );
  const ensureLastTopSet = useActiveSessionStore((s) => s.ensureLastTopSet);
  const logSet = useActiveSessionStore((s) => s.logSet);
  const toggleWarmupOverride = useActiveSessionStore((s) => s.toggleWarmupOverride);
  const setExerciseBrand = useActiveSessionStore((s) => s.setExerciseBrand);
  const startRestTimer = useRestTimerStore((s) => s.start);

  useEffect(() => {
    getSettings(db).then(setSettings);
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    getExercise(db, sessionExercise.exerciseId).then((row) => {
      if (!cancelled) setExercise(row);
    });
    return () => {
      cancelled = true;
    };
  }, [db, sessionExercise.exerciseId]);

  const repFloor = exercise && settings ? resolveRepFloor(exercise, settings) : 1;

  useEffect(() => {
    if (!exercise || !settings) return;
    ensureLastTopSet(db, sessionExercise.equipmentVariantId, repFloor);
  }, [db, exercise, settings, sessionExercise.equipmentVariantId, repFloor, ensureLastTopSet]);

  // Pre-fill: first set of this exercise this session anchors to last session's top
  // set; every set after that carries forward the one just logged. See lib/prefill.ts.
  useEffect(() => {
    if (setsThisSession.length > 0) {
      const next = resolveNextSetPrefill(setsThisSession);
      if (next) setDraft(next);
      return;
    }
    if (lastTopSet !== undefined) {
      setDraft(resolveFirstSetPrefill(lastTopSet) ?? FALLBACK_DRAFT);
    }
  }, [setsThisSession, lastTopSet]);

  if (!exercise || !settings) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const unit = settings.unitPreference;
  const weightIncrementLb = resolveWeightIncrement(exercise, settings);
  const weightStepDisplay =
    unit === 'lb' ? weightIncrementLb : roundToStep(fromLb(weightIncrementLb, unit), 0.5) || 0.5;
  const restSeconds = resolveRestSeconds(exercise, settings);

  const classified = classifyWarmups(
    setsThisSession.map((s) => ({
      id: s.id,
      weight: s.weight,
      reps: s.reps,
      position: s.position,
      isWarmupOverride: s.isWarmupOverride,
    })),
  );
  const topSet = selectTopSet(setsThisSession, repFloor);
  const improved = didImprove(topSet, lastTopSet ?? null);

  async function handleLogSet() {
    setIsLogging(true);
    try {
      await logSet(db, {
        equipmentVariantId: sessionExercise.equipmentVariantId,
        weight: draft.weight,
        reps: draft.reps,
        rir: draft.rir,
      });
      startRestTimer(restSeconds, sessionExercise.exerciseId);
    } finally {
      setIsLogging(false);
    }
  }

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.exerciseName}>{sessionExercise.name}</Text>
        <Text style={styles.positionLabel}>
          {indexInList} of {totalCount}
        </Text>
      </View>

      <Pressable style={styles.brandRow} onPress={() => setBrandPickerVisible(true)}>
        <Text style={styles.brandIcon}>⚙</Text>
        <Text style={sessionExercise.brand ? styles.brandLabel : styles.brandLabelEmpty}>
          {sessionExercise.brand ?? 'Add equipment brand'}
        </Text>
      </Pressable>

      {lastTopSet ? (
        <View style={styles.lastTimeBox}>
          <Text style={styles.lastTimeLabel}>Last time</Text>
          <Text style={styles.lastTimeValue}>
            {fromLb(lastTopSet.weight, unit)} × {lastTopSet.reps} @ {lastTopSet.rir} RIR
          </Text>
        </View>
      ) : null}

      {classified.length > 0 && (
        <View style={styles.setsList}>
          {classified.map((s, i) => (
            <SetRow
              key={s.id}
              index={i + 1}
              set={{ ...s, rir: setsThisSession.find((row) => row.id === s.id)?.rir ?? 0 }}
              isCurrentTopSet={topSet?.id === s.id}
              improved={improved}
              onToggleWarmup={() => {
                const fullSet = setsThisSession.find((row) => row.id === s.id);
                if (fullSet) toggleWarmupOverride(db, fullSet);
              }}
            />
          ))}
        </View>
      )}

      <View style={styles.entrySection}>
        <View style={styles.stepperRow}>
          <NumberStepper
            label="Weight"
            value={fromLb(draft.weight, unit)}
            step={weightStepDisplay}
            onChange={(next) => setDraft((d) => ({ ...d, weight: toLb(next, unit) }))}
          />
          <NumberStepper
            label="Reps"
            value={draft.reps}
            step={1}
            onChange={(next) => setDraft((d) => ({ ...d, reps: Math.round(next) }))}
          />
        </View>

        <RirSelector value={draft.rir} onChange={(rir) => setDraft((d) => ({ ...d, rir }))} />

        <Pressable
          style={[styles.logButton, isLogging && styles.logButtonDisabled]}
          onPress={handleLogSet}
          disabled={isLogging}
        >
          <Text style={styles.logButtonLabel}>Log set</Text>
        </Pressable>
      </View>

      {hasNext && (
        <Pressable style={styles.nextRow} onPress={onAdvance}>
          <Text style={styles.nextLabel}>Next</Text>
          <Text style={styles.nextArrow}>→</Text>
        </Pressable>
      )}
    </ScrollView>
    <EquipmentBrandPicker
      visible={brandPickerVisible}
      currentBrand={sessionExercise.brand}
      onClose={() => setBrandPickerVisible(false)}
      onSelect={(brand) => setExerciseBrand(db, sessionExercise.id, sessionExercise.exerciseId, brand)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface1 },
  content: { padding: 16 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: colors.surface1,
  },
  loadingText: { color: colors.textMuted },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  exerciseName: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  positionLabel: { fontSize: 12, color: colors.textMuted },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  brandIcon: { fontSize: 12, color: colors.textMuted },
  brandLabel: { fontSize: 13, color: colors.textSecondary },
  brandLabelEmpty: { fontSize: 13, color: colors.textMuted },
  lastTimeBox: {
    backgroundColor: colors.accentTintBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  lastTimeLabel: { fontSize: 11, color: colors.accentLight, marginBottom: 3 },
  lastTimeValue: { fontSize: 14, fontWeight: '600', color: colors.accentLight },
  setsList: { gap: 6, marginBottom: 14 },
  entrySection: {
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  stepperRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  logButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  logButtonDisabled: { opacity: 0.5 },
  logButtonLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  nextLabel: { fontSize: 13, color: colors.textSecondary },
  nextArrow: { fontSize: 15, color: colors.textMuted },
});
