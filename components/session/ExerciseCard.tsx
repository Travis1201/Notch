import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { getExercise } from '../../db/queries/exercises';
import { getSettings } from '../../db/queries/settings';
import type { Exercise, Settings } from '../../db/types';
import {
  useActiveSessionStore,
  EMPTY_SETS,
  type SessionExerciseVM,
  type SetRow,
} from '../../store/activeSessionStore';
import { useRestTimerStore } from '../../store/restTimerStore';
import {
  selectTopSet,
  didImprove,
  describeImprovement,
  formatPrDelta,
} from '../../lib/progression';
import { classifyWarmups } from '../../lib/warmups';
import {
  resolveRestSeconds,
  resolveWeightIncrement,
  resolveRepFloor,
} from '../../lib/exerciseDefaults';
import { fromLb, toLb, roundToStep } from '../../lib/units';
import { resolvePrefillForRow } from '../../lib/prefill';
import { SetTableRow } from './SetTableRow';
import type { DragHandle } from './DraggableExerciseList';
import { EditSetModal } from './EditSetModal';
import { NumberStepper } from './NumberStepper';
import { RirSelector } from './RirSelector';
import { EquipmentBrandPicker } from '../exercises/EquipmentBrandPicker';

interface Props {
  sessionExercise: SessionExerciseVM;
  // Supplied by DraggableExerciseList. The card renders the grip; the list owns the
  // gesture. Optional so the card still works outside a draggable list (and when the
  // drag feature flag is off).
  dragHandle?: DragHandle;
}

const LAST_TIME_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// CLAUDE.md "Live PR feedback" stage 1: "a pulse, not a persistent state... settles
// back to normal after well under a second."
const PR_PULSE_IN_MS = 140;
const PR_PULSE_HOLD_MS = 180;
const PR_PULSE_OUT_MS = 260;
// "a small scale bump" and "a brief flat-color tint" — 3% and a 22%-opacity flat fill.
// No glow, no gradient, per the same constraint the rest of the app follows.
const PR_PULSE_SCALE = 1.03;
const PR_PULSE_TINT_OPACITY = 0.22;
// The success haptic trails the per-set tap slightly. Fired in the same frame the two
// read as one buzz, which defeats the point — CLAUDE.md wants the light tap on every
// set precisely so the PR haptic is felt as something different.
const PR_HAPTIC_DELAY_MS = 130;

// One exercise's section of the active workout, laid out to notch-ui-mockups.png's
// middle panel: name, the equipment-brand row, the accent-tinted "Last time" block,
// the numbered set list, then the Weight/Reps steppers + RIR pills + a full-width
// "Log set" button.
//
// The mockup's panel is a single-exercise STEPPER ("3 of 6", a "Next · Incline DB
// press" arrow, one exercise on screen). That structure is not reproduced, and
// deliberately so: CLAUDE.md's "Active workout screen" section records it as built,
// used at the gym, and rejected — it locked the user into one exercise and made
// already-logged sets uneditable — and the mockup file's own header note defers to
// CLAUDE.md on component behaviour. So this is the mockup's visual language applied
// to a card that repeats down one scroll, every exercise loggable in any order.
//
// Entry is ONE always-pre-filled row rather than a set of unconfirmed draft rows
// (what this component used to render). Per CLAUDE.md "confirm, don't input," the
// numbers for the next set are already sitting in the steppers the instant the
// previous set is logged — resolved per row index from last session's working sets
// (lib/prefill.ts), so a session that dropped weight after its top set pre-fills each
// row with its own number instead of repeating the top set's. Logging is one tap on
// "Log set"; adjusting is one or two taps on a stepper first. There is no "+ Add set"
// control because there is nothing for it to do — the entry row IS the next set.
export function ExerciseCard({ sessionExercise, dragHandle }: Props) {
  const db = useDatabase();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [brandPickerVisible, setBrandPickerVisible] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  // At most one set row in this exercise may be swiped open at a time; two rows hanging
  // open at once reads as a rendering bug rather than a state.
  const [openSwipeSetId, setOpenSwipeSetId] = useState<string | null>(null);

  // Entry row state, in DISPLAY units (lb or kg) — converted to lb only when the set
  // is actually logged, per CLAUDE.md "Units": store in pounds, convert at the UI
  // boundary. Local to this card, never in the store: see activeSessionStore.logSet.
  const [entryWeight, setEntryWeight] = useState(0);
  const [entryReps, setEntryReps] = useState(0);
  const [entryRir, setEntryRir] = useState(0);

  // One value drives both halves of the PR pulse. Native driver throughout, like every
  // other animation in this app — the tint is an overlay's OPACITY rather than an
  // animated backgroundColor precisely so it can stay on the native driver (colour
  // interpolation can't), and so nothing here risks mixing drivers on one value.
  const prPulse = useRef(new Animated.Value(0)).current;
  const prPulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const variantId = sessionExercise.equipmentVariantId;

  const setsThisSession = useActiveSessionStore(
    (s) => s.setsByEquipmentVariantId[variantId] ?? EMPTY_SETS,
  );
  const lastTopSet = useActiveSessionStore((s) => s.lastTopSetByEquipmentVariantId[variantId]);
  const lastWorkingSets = useActiveSessionStore(
    (s) => s.lastWorkingSetsByEquipmentVariantId[variantId] ?? EMPTY_SETS,
  );
  const lastWorkingSetsLoaded = useActiveSessionStore(
    (s) => s.lastWorkingSetsByEquipmentVariantId[variantId] !== undefined,
  );
  const ensureLastTopSet = useActiveSessionStore((s) => s.ensureLastTopSet);
  const ensureLastWorkingSets = useActiveSessionStore((s) => s.ensureLastWorkingSets);
  const logSet = useActiveSessionStore((s) => s.logSet);
  const updateSet = useActiveSessionStore((s) => s.updateSet);
  const deleteLoggedSet = useActiveSessionStore((s) => s.deleteLoggedSet);
  const toggleWarmupOverride = useActiveSessionStore((s) => s.toggleWarmupOverride);
  const setExerciseBrand = useActiveSessionStore((s) => s.setExerciseBrand);
  const removeExercise = useActiveSessionStore((s) => s.removeExercise);
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
  const unit = settings?.unitPreference ?? 'lb';

  useEffect(() => {
    if (!exercise || !settings) return;
    ensureLastTopSet(db, variantId, repFloor);
    ensureLastWorkingSets(db, variantId);
  }, [db, exercise, settings, variantId, repFloor, ensureLastTopSet, ensureLastWorkingSets]);

  // Re-seeds the entry row whenever the row it represents changes: a set gets logged
  // or deleted here (setCount), last session's reference data arrives, the equipment
  // brand switches to a different variant, or the unit preference changes. It
  // deliberately does NOT depend on anything the user types, so adjusting a stepper
  // and then logging can't be clobbered mid-edit.
  const setCount = setsThisSession.length;
  useEffect(() => {
    setOpenSwipeSetId(null);
  }, [setCount]);

  useEffect(() => {
    if (!lastWorkingSetsLoaded) return;
    const prefill = resolvePrefillForRow(
      lastWorkingSets,
      setCount,
      setsThisSession[setCount - 1] ?? null,
    );
    setEntryWeight(fromLb(prefill.weight, unit));
    setEntryReps(prefill.reps);
    setEntryRir(prefill.rir);
    // setsThisSession is intentionally read but not a dependency — only its LENGTH
    // should re-seed the row. Depending on the array itself would reset the steppers
    // every time an existing set was edited, discarding numbers already dialled in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWorkingSetsLoaded, lastWorkingSets, setCount, variantId, unit]);

  // CLAUDE.md "Live PR feedback" stage 1. Fires once per PR and settles; it is
  // deliberately not a state anything else reads, because stage 2's delta — the part
  // that persists — is derived from the sets themselves on every render, not from
  // whether this ran.
  const celebratePr = useCallback(() => {
    if (prPulseTimeout.current) clearTimeout(prPulseTimeout.current);
    prPulseTimeout.current = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, PR_HAPTIC_DELAY_MS);

    prPulse.stopAnimation();
    Animated.sequence([
      Animated.timing(prPulse, {
        toValue: 1,
        duration: PR_PULSE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.delay(PR_PULSE_HOLD_MS),
      Animated.timing(prPulse, {
        toValue: 0,
        duration: PR_PULSE_OUT_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [prPulse]);

  useEffect(
    () => () => {
      if (prPulseTimeout.current) clearTimeout(prPulseTimeout.current);
    },
    [],
  );

  // Decides whether an action just produced a NEW personal record, by comparing the
  // session's top set before and after it. `before` is the render-time `topSet`; the
  // after-state is read from the store rather than from this render's props, which are
  // a render behind by the time an awaited write resolves.
  //
  // Comparing the two is what keeps the pulse honest. Logging a set worse than today's
  // best leaves the top set untouched and celebrates nothing; logging a better one, or
  // editing a set into being the best, changes it and does. Deleting a set can only
  // ever remove a PR, never create one, so it needs no handling here — stage 2's label
  // simply stops being derived.
  const evaluatePrAfterChange = useCallback(
    (before: SetRow | null) => {
      const after = useActiveSessionStore.getState().setsByEquipmentVariantId[variantId] ?? EMPTY_SETS;
      const nextTop = selectTopSet(after, repFloor);
      if (!didImprove(nextTop, lastTopSet ?? null)) return;
      const unchanged =
        before !== null &&
        nextTop !== null &&
        before.id === nextTop.id &&
        before.weight === nextTop.weight &&
        before.reps === nextTop.reps;
      if (unchanged) return;
      celebratePr();
    },
    [celebratePr, lastTopSet, repFloor, variantId],
  );

  if (!exercise || !settings) {
    return (
      <View style={styles.loadingCard}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const weightIncrementLb = resolveWeightIncrement(exercise, settings);
  const weightStepDisplay =
    unit === 'lb' ? weightIncrementLb : roundToStep(fromLb(weightIncrementLb, unit), 0.5) || 0.5;
  const restSeconds = resolveRestSeconds(exercise, settings);
  const formatWeight = (lb: number) => fromLb(lb, unit);

  // classifyWarmups takes only the fields the inference rule needs, so its result
  // carries no RIR — keyed by id here and read back alongside the full row, rather
  // than looking each row up again per cell.
  const warmupById = new Map(
    classifyWarmups(
      setsThisSession.map((s) => ({
        id: s.id,
        weight: s.weight,
        reps: s.reps,
        position: s.position,
        isWarmupOverride: s.isWarmupOverride,
      })),
    ).map((s) => [s.id, s.isWarmup]),
  );
  const topSet = selectTopSet(setsThisSession, repFloor);
  const improved = didImprove(topSet, lastTopSet ?? null);

  // CLAUDE.md "Live PR feedback" stage 2, and both of its correctness notes fall out of
  // computing it here rather than storing it: the label is attached to whichever set
  // currently IS the session's top set, so it moves on its own when a later set
  // overtakes an earlier one, and it recomputes when a logged set is edited — because
  // both of those change `topSet`, which this reads. Nothing is keyed to a set id and
  // nothing is cached.
  const prDelta = describeImprovement(topSet, lastTopSet ?? null);
  const improvementLabel = prDelta
    ? formatPrDelta(prDelta, { toDisplayWeight: formatWeight, unitLabel: unit })
    : null;

  // "Last time · Aug 31 / 225 × 7 @ 1 RIR" — the date comes from the top set's own
  // loggedAt rather than its session's date row, which is what makes this correct
  // without a second query: the set is by definition in the previous session, and its
  // timestamp is when it was actually performed (a session finalised the next morning
  // still reports the day it was trained).
  const lastTimeDate = lastTopSet ? LAST_TIME_DATE_FORMAT.format(lastTopSet.loggedAt) : null;

  const editingSet = editingSetId ? setsThisSession.find((s) => s.id === editingSetId) ?? null : null;

  async function handleLogSet() {
    const topSetBefore = topSet;
    // CLAUDE.md "Live PR feedback": "A plain haptic tap (light impact) fires on every
    // logged set regardless." Fired before the write, not after it, so the confirmation
    // is felt on the tap rather than on the round-trip.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await logSet(db, variantId, {
      weight: toLb(entryWeight, unit),
      reps: Math.round(entryReps),
      rir: entryRir,
    });
    evaluatePrAfterChange(topSetBefore);
    startRestTimer(restSeconds, sessionExercise.exerciseId);
  }

  // The mid-workout undo for "I added this exercise by mistake" / "not doing it after
  // all." Warns about logged sets by count, because removing the exercise deletes
  // them from this session too (see removeExerciseFromSession) — and an exercise with
  // nothing logged is the common case and shouldn't read as dangerous.
  function handleRemoveExercise() {
    const loggedCount = setsThisSession.length;
    Alert.alert(
      `Remove ${sessionExercise.name}?`,
      loggedCount > 0
        ? `${loggedCount} logged set${loggedCount === 1 ? '' : 's'} will be deleted from this workout. Previous sessions aren't affected.`
        : 'It will be taken out of this workout.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeExercise(db, sessionExercise.id),
        },
      ],
    );
  }

  return (
    <Animated.View
      style={[
        styles.card,
        dragHandle?.isDragging && styles.cardDragging,
        { transform: [{ scale: prPulse.interpolate({ inputRange: [0, 1], outputRange: [1, PR_PULSE_SCALE] }) }] },
      ]}
    >
      {/* The flat tint. An overlay rather than an animated backgroundColor so it stays
          on the native driver, and green because CLAUDE.md reserves it for progression
          indicators — which is exactly what a PR is. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.prTint,
          { opacity: prPulse.interpolate({ inputRange: [0, 1], outputRange: [0, PR_PULSE_TINT_OPACITY] }) },
        ]}
      />
      <View style={styles.titleRow}>
        {dragHandle && (
          // Drag starts here and nowhere else. Anchored at the far left, well away from
          // the remove control, and generously padded because it is a small target that
          // has to be hit reliably one-handed.
          <View {...dragHandle.panHandlers} style={styles.dragHandle} hitSlop={12}>
            <Feather
              name="menu"
              size={21}
              color={dragHandle.isDragging ? colors.accentLight : colors.textSecondary}
            />
          </View>
        )}
        <Text style={styles.exerciseName}>{sessionExercise.name}</Text>
        <Pressable onPress={handleRemoveExercise} hitSlop={10} style={styles.removeButton}>
          <Feather name="x" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <Pressable style={styles.brandRow} onPress={() => setBrandPickerVisible(true)}>
        <Feather name="zap" size={14} color={colors.textMuted} />
        <Text style={sessionExercise.brand ? styles.brandLabel : styles.brandLabelEmpty}>
          {sessionExercise.brand ?? 'Add equipment brand'}
        </Text>
      </Pressable>

      {lastTopSet ? (
        <View style={styles.lastTimeBlock}>
          <Text style={styles.lastTimeLabel}>Last time · {lastTimeDate}</Text>
          <Text style={styles.lastTimeValue}>
            {formatWeight(lastTopSet.weight)} × {lastTopSet.reps} @{' '}
            {lastTopSet.rir >= 4 ? '4+' : lastTopSet.rir} RIR
          </Text>
        </View>
      ) : (
        <View style={styles.noHistoryBlock}>
          <Text style={styles.noHistoryLabel}>
            {sessionExercise.brand
              ? `First time on ${sessionExercise.brand} here`
              : 'No history on this equipment yet'}
          </Text>
        </View>
      )}

      {setsThisSession.length > 0 && (
        <View style={styles.setsList}>
          {setsThisSession.map((s, i) => (
            <SetTableRow
              key={s.id}
              index={i + 1}
              weight={s.weight}
              reps={s.reps}
              rir={s.rir}
              isWarmup={warmupById.get(s.id) ?? false}
              isCurrentTopSet={topSet?.id === s.id}
              improved={improved}
              improvementLabel={topSet?.id === s.id ? improvementLabel : null}
              formatWeight={formatWeight}
              onOpenEdit={() => setEditingSetId(s.id)}
              onToggleWarmup={() => toggleWarmupOverride(db, s)}
              onDelete={() => deleteLoggedSet(db, variantId, s.id)}
              isSwipeOpen={openSwipeSetId === s.id}
              onSwipeOpen={() => setOpenSwipeSetId(s.id)}
              // Guarded: a row that was never open must not clear a sibling's open
              // state when its own gesture settles closed.
              onSwipeClose={() =>
                setOpenSwipeSetId((current) => (current === s.id ? null : current))
              }
            />
          ))}
        </View>
      )}

      <View style={styles.entrySection}>
        <View style={styles.stepperRow}>
          <NumberStepper
            label="Weight"
            value={entryWeight}
            step={weightStepDisplay}
            onChange={setEntryWeight}
          />
          <NumberStepper label="Reps" value={entryReps} step={1} onChange={setEntryReps} />
        </View>

        <View style={styles.rirBlock}>
          <RirSelector value={entryRir} onChange={setEntryRir} />
        </View>

        <Pressable style={styles.logButton} onPress={handleLogSet}>
          <Text style={styles.logLabel}>Log set</Text>
        </Pressable>
      </View>

      <EquipmentBrandPicker
        visible={brandPickerVisible}
        currentBrand={sessionExercise.brand}
        onClose={() => setBrandPickerVisible(false)}
        onSelect={(brand) => setExerciseBrand(db, sessionExercise.id, sessionExercise.exerciseId, brand)}
      />

      {editingSet && (
        <EditSetModal
          visible
          index={setsThisSession.findIndex((s) => s.id === editingSet.id) + 1}
          weight={formatWeight(editingSet.weight)}
          reps={editingSet.reps}
          rir={editingSet.rir}
          weightStep={weightStepDisplay}
          onClose={() => setEditingSetId(null)}
          onSave={async ({ weight, reps, rir }) => {
            const setId = editingSet.id;
            const topSetBefore = topSet;
            setEditingSetId(null);
            await updateSet(db, setId, variantId, {
              weight: toLb(weight, unit),
              reps: Math.round(reps),
              rir,
            });
            // CLAUDE.md: "Editing a logged set mid-session must re-trigger this,
            // exactly like logging a new one."
            evaluatePrAfterChange(topSetBefore);
          }}
          onDelete={async () => {
            const setId = editingSet.id;
            setEditingSetId(null);
            await deleteLoggedSet(db, variantId, setId);
          }}
        />
      )}
    </Animated.View>
  );
}

// Spacing follows notch-ui-mockups.html's active-workout panel: 16px card padding,
// the 18px/500 exercise name, the brand row at 13px secondary, an 8px-radius accent
// tint block for "Last time," 6px between set rows, and a hairline above the entry
// controls.
const styles = StyleSheet.create({
  // No bottom margin: the inter-card gap is padding on DraggableExerciseList's
  // wrapper instead, so a card's measured height is exactly its drop-slot height. A
  // margin here would sit outside that measurement and every drop target would be off
  // by one gap, compounding with distance.
  card: {
    backgroundColor: colors.surface1,
    borderRadius: 14,
    padding: 16,
  },
  cardDragging: { borderWidth: 0.5, borderColor: colors.accent },
  prTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: colors.textSuccess,
  },
  loadingCard: {
    backgroundColor: colors.surface1,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  loadingText: { color: colors.textMuted },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  // Sized up from a 16px glyph after testing: it's the only way to move an exercise,
  // and it has to be hit first time one-handed. The padding is part of the target, not
  // decoration — with hitSlop it gives roughly a 44pt touch area around a 21px icon.
  dragHandle: { paddingRight: 12, paddingVertical: 6 },
  exerciseName: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  removeButton: { paddingLeft: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingVertical: 2 },
  brandLabel: { fontSize: 13, color: colors.textSecondary },
  brandLabelEmpty: { fontSize: 13, color: colors.textMuted },
  lastTimeBlock: {
    backgroundColor: colors.accentTintBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  lastTimeLabel: { fontSize: 11, color: colors.accentLight, marginBottom: 3 },
  lastTimeValue: { fontSize: 14, fontWeight: '500', color: colors.accentLight },
  noHistoryBlock: {
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  noHistoryLabel: { fontSize: 12, color: colors.textMuted },
  setsList: { gap: 6, marginBottom: 14 },
  entrySection: { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 14 },
  stepperRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  rirBlock: { marginBottom: 12 },
  logButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logLabel: { fontSize: 15, fontWeight: '500', color: '#fff' },
});
