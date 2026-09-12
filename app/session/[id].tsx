import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { useActiveSessionStore } from '../../store/activeSessionStore';
import { useRestTimerNotifications } from '../../hooks/useRestTimerNotifications';
import { getTemplate, getTemplateExercises, setTemplateExercises } from '../../db/queries/templates';
import { computeDurationSeconds } from '../../lib/sessionDuration';
import { ExerciseCard } from '../../components/session/ExerciseCard';
import {
  DraggableExerciseList,
  type DragScrollController,
} from '../../components/session/DraggableExerciseList';
import { RestTimerBar } from '../../components/session/RestTimerBar';
import { AddExerciseModal } from '../../components/session/AddExerciseModal';
import {
  FinishWorkoutModal,
  type TemplateChange,
} from '../../components/session/FinishWorkoutModal';
import { ConfirmModal } from '../../components/shared/ConfirmModal';

function formatElapsed(startedAt: Date, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  // Rolls over to h:mm:ss past an hour instead of counting minutes upward forever —
  // legitimate long sessions exist (CLAUDE.md sets auto-close at 3 hours precisely
  // because of them), and "142:07" is not a readable elapsed time.
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// CLAUDE.md "Active workout screen" (SUPERSEDES the old single-exercise-stepper
// design): one scrollable screen, every exercise visible at once, no forced order.
//
// The persistent header leads with the elapsed-time clock, centred and large: it's the
// one number the user glances at from arm's length mid-set, so it outranks the screen
// title for that space. Cancel and Finish sit side by side beneath it as equally
// visible, equally labelled buttons — Cancel used to live behind a three-dot overflow
// menu, which hid a destructive action behind an unlabelled glyph and made the only
// way out of a mis-tapped Start something you had to go looking for.
//
// BOTH end-of-workout actions confirm, through a real sheet rather than a native
// Alert (components/shared/ConfirmModal). Finish previously committed on the tap,
// which on a one-handed sweaty screen meant a mis-tap permanently ended the workout
// with no way back — finalising stores a duration and turns the session into a
// completed record later sessions get compared against.
//
// Reordering is drag-and-drop by the grip handle in each card's header — see
// components/session/DraggableExerciseList.tsx, which also documents why it's built on
// PanResponder rather than a gesture library. This screen's only part in it is the
// scroll plumbing: a drag has to be able to read where the viewport is, how far the
// content is scrolled, and drive the scroll itself to auto-scroll when a card is held
// near an edge.
export default function ActiveSessionScreen() {
  useKeepAwake(); // CLAUDE.md Gotchas: keep screen awake during an active workout
  useRestTimerNotifications();

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();

  const isHydrated = useActiveSessionStore((s) => s.isHydrated);
  const sessionDate = useActiveSessionStore((s) => s.date);
  const templateId = useActiveSessionStore((s) => s.templateId);
  const exercises = useActiveSessionStore((s) => s.exercises);
  const setsByVariant = useActiveSessionStore((s) => s.setsByEquipmentVariantId);
  const loadSession = useActiveSessionStore((s) => s.loadSession);
  const addExercise = useActiveSessionStore((s) => s.addExercise);
  const reorderExercises = useActiveSessionStore((s) => s.reorderExercises);
  const finish = useActiveSessionStore((s) => s.finish);
  const cancel = useActiveSessionStore((s) => s.cancel);
  const reset = useActiveSessionStore((s) => s.reset);

  const [addExerciseModalVisible, setAddExerciseModalVisible] = useState(false);
  const [isDraggingExercise, setIsDraggingExercise] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [templateName, setTemplateName] = useState<string | null>(null);

  const [finishModalVisible, setFinishModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  // Resolved once when the Finish sheet opens, not recomputed while it's on screen —
  // it describes the session as it stood at the moment the user asked to finish.
  const [templateChanges, setTemplateChanges] = useState<TemplateChange[]>([]);
  const [nextTemplateExerciseIds, setNextTemplateExerciseIds] = useState<string[]>([]);
  // Opt-in, and reset every time the sheet opens: nothing edits a reused template
  // unless the user says so on that specific occasion.
  const [saveChangesToTemplate, setSaveChangesToTemplate] = useState(false);

  useEffect(() => {
    if (id) loadSession(db, id);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!templateId) {
      setTemplateName(null);
      return;
    }
    let cancelled = false;
    getTemplate(db, templateId).then((t) => {
      if (!cancelled) setTemplateName(t?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [db, templateId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const scrollRef = useRef<ScrollView>(null);
  const scrollWrapperRef = useRef<View>(null);
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  // Window coordinates, cached from onLayout. The drag compares a gesture's absolute
  // `moveY` against these to decide when to auto-scroll, and measureInWindow is async
  // so it can't be called from inside the gesture — it's resolved here instead, and
  // re-resolved whenever layout changes (the rest-timer bar appearing, for instance).
  const scrollViewportRef = useRef({ top: 0, height: 0 });

  const handleScrollWrapperLayout = useCallback(() => {
    scrollWrapperRef.current?.measureInWindow((_x, y, _width, height) => {
      scrollViewportRef.current = { top: y, height };
    });
  }, []);

  const dragScroll = useMemo<DragScrollController>(
    () => ({
      scrollTo: (y) => scrollRef.current?.scrollTo({ y, animated: false }),
      getOffset: () => scrollOffsetRef.current,
      getContentHeight: () => contentHeightRef.current,
      getViewport: () => scrollViewportRef.current,
    }),
    [],
  );

  const allSets = useMemo(() => Object.values(setsByVariant).flat(), [setsByVariant]);

  // CLAUDE.md "Templates": once a session has an actual planned exercise count, show
  // "X of Y logged so far". Explicitly NOT the old "N of M" stepper counter — no
  // forced order, no gating, purely display. An ad-hoc session has no template and so
  // no planned count, which is why this is null without one.
  const loggedExerciseCount = useMemo(
    () => exercises.filter((e) => (setsByVariant[e.equipmentVariantId] ?? []).length > 0).length,
    [exercises, setsByVariant],
  );
  const progressLabel =
    templateId && exercises.length > 0 ? `${loggedExerciseCount} of ${exercises.length}` : null;

  // CLAUDE.md "Templates > Structure changes DO prompt": additions and removals, asked
  // once, on completion. Reordering is excluded on purpose — it's a display preference
  // mid-session, and the rebuilt list below keeps the TEMPLATE's order precisely so
  // accepting an add or a remove can't reorder the template as a side effect.
  async function openFinishModal() {
    setSaveChangesToTemplate(false);

    if (templateId) {
      const templateExerciseRows = await getTemplateExercises(db, templateId);
      const templateExerciseIds = templateExerciseRows.map((r) => r.exerciseId);
      const templateExerciseIdSet = new Set(templateExerciseIds);
      const sessionExerciseIdSet = new Set(exercises.map((e) => e.exerciseId));

      const changes: TemplateChange[] = [
        ...exercises
          .filter((e) => !templateExerciseIdSet.has(e.exerciseId))
          .map((e): TemplateChange => ({ kind: 'added', exerciseId: e.exerciseId, name: e.name })),
        ...templateExerciseRows
          .filter((r) => !sessionExerciseIdSet.has(r.exerciseId))
          .map((r): TemplateChange => ({
            kind: 'removed',
            exerciseId: r.exerciseId,
            name: r.exercise.name,
          })),
      ];

      setTemplateChanges(changes);
      setNextTemplateExerciseIds([
        ...templateExerciseIds.filter((exerciseId) => sessionExerciseIdSet.has(exerciseId)),
        ...exercises
          .filter((e) => !templateExerciseIdSet.has(e.exerciseId))
          .map((e) => e.exerciseId),
      ]);
    } else {
      setTemplateChanges([]);
      setNextTemplateExerciseIds([]);
    }

    setFinishModalVisible(true);
  }

  async function handleConfirmFinish() {
    if (busy) return;
    setBusy(true);
    try {
      if (saveChangesToTemplate && templateId && templateChanges.length > 0) {
        await setTemplateExercises(db, templateId, nextTemplateExerciseIds);
      }
      await finish(db);
      setFinishModalVisible(false);
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmCancel() {
    if (busy) return;
    setBusy(true);
    try {
      await cancel(db);
      setCancelModalVisible(false);
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  }

  if (!isHydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Feather name="chevron-left" size={20} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {templateName ?? 'Workout'}
          </Text>
          <Text style={styles.progressLabel}>{progressLabel ?? ''}</Text>
        </View>

        {/* The clock is the header's centrepiece. Tabular figures so the digits don't
            shift the layout as the seconds tick over. */}
        <Text style={styles.clock}>{sessionDate ? formatElapsed(sessionDate, now) : '0:00'}</Text>

        <View style={styles.headerActions}>
          <Pressable style={styles.cancelButton} onPress={() => setCancelModalVisible(true)}>
            <Text style={styles.cancelButtonLabel}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.finishButton} onPress={openFinishModal}>
            <Text style={styles.finishButtonLabel}>Finish</Text>
          </Pressable>
        </View>
      </View>

      <RestTimerBar />

      {/* collapsable={false} keeps this View in the native hierarchy on Android, which
          measureInWindow needs; RN otherwise optimises away a layout-only View. */}
      <View
        ref={scrollWrapperRef}
        style={styles.list}
        onLayout={handleScrollWrapperLayout}
        collapsable={false}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.listContent}
          // Handed to the drag while a card is held: auto-scroll drives the offset
          // itself, and letting the ScrollView also respond would have the two fight
          // over it. Programmatic scrollTo still works while this is false.
          scrollEnabled={!isDraggingExercise}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={(_width, height) => {
            contentHeightRef.current = height;
          }}
        >
          {exercises.length === 0 && (
            <Text style={styles.emptyText}>Add an exercise below to get started.</Text>
          )}

          <DraggableExerciseList
            items={exercises}
            keyExtractor={(sessionExercise) => sessionExercise.id}
            gap={16}
            scroll={dragScroll}
            onDraggingChange={setIsDraggingExercise}
            onReorder={(orderedIds) => reorderExercises(db, orderedIds)}
            renderItem={(sessionExercise, dragHandle) => (
              <ExerciseCard sessionExercise={sessionExercise} dragHandle={dragHandle} />
            )}
          />

          <Pressable style={styles.addExerciseRow} onPress={() => setAddExerciseModalVisible(true)}>
            <Feather name="plus" size={16} color={colors.textSecondary} />
            <Text style={styles.addExerciseLabel}>Add exercise</Text>
          </Pressable>
        </ScrollView>
      </View>

      <AddExerciseModal
        visible={addExerciseModalVisible}
        onClose={() => setAddExerciseModalVisible(false)}
        onSelect={async (exercise) => {
          await addExercise(db, exercise.id, exercise.name);
          setAddExerciseModalVisible(false);
        }}
      />

      <FinishWorkoutModal
        visible={finishModalVisible}
        templateName={templateName}
        exerciseCount={exercises.length}
        setCount={allSets.length}
        durationSeconds={computeDurationSeconds(allSets)}
        changes={templateChanges}
        saveChangesToTemplate={saveChangesToTemplate}
        onToggleSaveChanges={() => setSaveChangesToTemplate((v) => !v)}
        onConfirm={handleConfirmFinish}
        onClose={() => setFinishModalVisible(false)}
      />

      <ConfirmModal
        visible={cancelModalVisible}
        title="Cancel this workout?"
        message={
          allSets.length > 0
            ? `${allSets.length} logged ${allSets.length === 1 ? 'set' : 'sets'} will be deleted and this workout won't appear in History. This can't be undone.`
            : "This workout will be discarded and won't appear in History."
        }
        confirmLabel="Discard workout"
        confirmTone="destructive"
        cancelLabel="Keep logging"
        onConfirm={handleConfirmCancel}
        onClose={() => setCancelModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Equal width to progressLabel so the centred title is optically centred regardless
  // of whether there's a progress count to show.
  backButton: { width: 52, alignItems: 'flex-start' },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  progressLabel: { width: 52, fontSize: 12, color: colors.textMuted, textAlign: 'right' },
  clock: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
    marginBottom: 12,
  },
  headerActions: { flexDirection: 'row', gap: 10 },
  cancelButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonLabel: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  finishButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonLabel: { fontSize: 15, fontWeight: '500', color: '#fff' },
  list: { flex: 1 },
  listContent: { padding: 16 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
  addExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  addExerciseLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
});
