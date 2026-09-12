import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  getSession,
  deleteSession,
  updateSessionGym,
  updateSessionDate,
} from '../../db/queries/sessions';
import {
  listSessionExercises,
  addExerciseToSession,
  removeExerciseFromSession,
} from '../../db/queries/sessionExercises';
import {
  listSetsForSession,
  logSet,
  updateSet,
  deleteSet,
  getLastSessionTopSet,
} from '../../db/queries/sets';
import {
  getLastUsedBrand,
  findOrCreateEquipmentVariant,
  getEquipmentVariant,
} from '../../db/queries/equipmentVariants';
import { listGyms, createGym } from '../../db/queries/gyms';
import { getTemplate } from '../../db/queries/templates';
import { getSettings } from '../../db/queries/settings';
import { resolveWeightIncrement, resolveRepFloor } from '../../lib/exerciseDefaults';
import { fromLb, toLb, roundToStep } from '../../lib/units';
import { selectTopSet, didImprove } from '../../lib/progression';
import { classifyWarmups } from '../../lib/warmups';
import type { Session, Gym, Settings, Set as SetRow } from '../../db/types';
import { SetTableRow } from '../../components/session/SetTableRow';
import { EditSetModal } from '../../components/session/EditSetModal';
import { GymSwitcherModal } from '../../components/gyms/GymSwitcherModal';
import { DateEditModal } from '../../components/history/DateEditModal';
import { AddExerciseModal } from '../../components/session/AddExerciseModal';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

interface ExerciseSection {
  sessionExerciseId: string;
  exerciseId: string;
  name: string;
  equipmentVariantId: string;
  brand: string | null;
  sets: SetRow[];
  repFloor: number;
  weightStepDisplay: number;
  improved: boolean;
}

// CLAUDE.md "History editing": past sessions are fully editable — adding an
// exercise/sets, editing or deleting individual sets, correcting gym or date, and
// deleting the whole session. Every derived value (top set, green arrow) goes through
// the same shared functions the live screen uses — nothing about "improved" is
// cached, so an edit here can correctly change the arrow on this session and,
// implicitly, on whichever later session it was being compared against.
export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();

  const [session, setSession] = useState<Session | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [sections, setSections] = useState<ExerciseSection[]>([]);
  const [loading, setLoading] = useState(true);

  const [gymSwitcherVisible, setGymSwitcherVisible] = useState(false);
  const [dateEditVisible, setDateEditVisible] = useState(false);
  const [addExerciseVisible, setAddExerciseVisible] = useState(false);
  const [editingSet, setEditingSet] = useState<{ variantId: string; setId: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const sessionRow = await getSession(db, id);
    if (!sessionRow) {
      setSession(null);
      setLoading(false);
      return;
    }

    const [gymList, exerciseRows, allSets, settingsRow] = await Promise.all([
      listGyms(db),
      listSessionExercises(db, id),
      listSetsForSession(db, id),
      getSettings(db),
    ]);

    const setsByVariant = new Map<string, SetRow[]>();
    for (const s of allSets) {
      const list = setsByVariant.get(s.equipmentVariantId);
      if (list) list.push(s);
      else setsByVariant.set(s.equipmentVariantId, [s]);
    }

    const builtSections = await Promise.all(
      exerciseRows.map(async (row): Promise<ExerciseSection | null> => {
        if (!row.equipmentVariantId) return null;
        const variantId = row.equipmentVariantId;
        const exerciseSets = setsByVariant.get(variantId) ?? [];
        const repFloor = resolveRepFloor(row.exercise, settingsRow);
        const weightIncrementLb = resolveWeightIncrement(row.exercise, settingsRow);
        const unit = settingsRow.unitPreference;
        const weightStepDisplay =
          unit === 'lb' ? weightIncrementLb : roundToStep(fromLb(weightIncrementLb, unit), 0.5) || 0.5;

        const topSet = selectTopSet(exerciseSets, repFloor);
        const previousTopSet = await getLastSessionTopSet(db, variantId, id, repFloor, sessionRow.date);
        const variant = await getEquipmentVariant(db, variantId);

        return {
          sessionExerciseId: row.id,
          exerciseId: row.exerciseId,
          name: row.exercise.name,
          equipmentVariantId: variantId,
          brand: variant?.brand ?? null,
          sets: exerciseSets,
          repFloor,
          weightStepDisplay,
          improved: didImprove(topSet, previousTopSet),
        };
      }),
    );

    let resolvedTemplateName: string | null = null;
    if (sessionRow.templateId) {
      const t = await getTemplate(db, sessionRow.templateId);
      resolvedTemplateName = t?.name ?? null;
    }

    setSession(sessionRow);
    setGyms(gymList);
    setSettings(settingsRow);
    setTemplateName(resolvedTemplateName);
    setSections(builtSections.filter((s): s is ExerciseSection => s !== null));
    setLoading(false);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  if (loading || !session || !settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const unit = settings.unitPreference;
  const formatWeight = (lb: number) => fromLb(lb, unit);
  const gymName = gyms.find((g) => g.id === session.gymId)?.name ?? '';

  function handleDeleteSession() {
    Alert.alert('Delete this session?', 'This removes the whole workout, including every set logged in it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSession(db, session!.id);
          router.back();
        },
      },
    ]);
  }

  // The counterpart to History editing's "Add an exercise (and its sets) to a
  // completed session": an exercise added by mistake, or one whose sets all turn out
  // to belong to a different day, has to be removable again or the mistake is
  // permanent. Scoped to this session — see removeExerciseFromSession, which never
  // touches the same exercise's sets in any other workout.
  //
  // Deliberately does NOT prompt about templates. CLAUDE.md "History editing":
  // "History edits do not prompt about templates. The template-update prompt is a
  // finish-workout interaction." Someone fixing a three-week-old typo should not be
  // asked about their Push day.
  function handleRemoveExercise(section: ExerciseSection) {
    const loggedCount = section.sets.length;
    Alert.alert(
      `Remove ${section.name}?`,
      loggedCount > 0
        ? `${loggedCount} set${loggedCount === 1 ? '' : 's'} will be deleted from this session. Other sessions aren't affected.`
        : 'It will be taken out of this session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeExerciseFromSession(db, {
              sessionId: session!.id,
              sessionExerciseId: section.sessionExerciseId,
              exerciseId: section.exerciseId,
            });
            load();
          },
        },
      ],
    );
  }

  const editingSection = editingSet ? sections.find((s) => s.equipmentVariantId === editingSet.variantId) : null;
  const editingSetRow = editingSet?.setId
    ? (editingSection?.sets.find((s) => s.id === editingSet.setId) ?? null)
    : null;
  const editingIndex = editingSection
    ? editingSet?.setId
      ? editingSection.sets.findIndex((s) => s.id === editingSet.setId) + 1
      : editingSection.sets.length + 1
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {templateName ?? 'Workout'}
        </Text>
        <Pressable onPress={handleDeleteSession} hitSlop={8}>
          <Feather name="trash-2" size={17} color={colors.textError} />
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Pressable style={styles.metaPill} onPress={() => setDateEditVisible(true)}>
          <Feather name="calendar" size={12} color={colors.textSecondary} />
          <Text style={styles.metaPillLabel}>{DATE_FORMAT.format(session.date)}</Text>
        </Pressable>
        <Pressable style={styles.metaPill} onPress={() => setGymSwitcherVisible(true)}>
          <Feather name="map-pin" size={12} color={colors.textSecondary} />
          <Text style={styles.metaPillLabel}>{gymName}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.length === 0 && <Text style={styles.emptyText}>No exercises logged.</Text>}

        {sections.map((section) => (
          <View key={section.sessionExerciseId} style={styles.card}>
            <View style={styles.exerciseTitleRow}>
              <Text style={styles.exerciseName}>{section.name}</Text>
              <Pressable
                onPress={() => handleRemoveExercise(section)}
                hitSlop={10}
                style={styles.removeButton}
              >
                <Feather name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
            {section.brand && <Text style={styles.brandLabel}>{section.brand}</Text>}

            {section.sets.length > 0 && (
              <View style={styles.setsList}>
                {classifyWarmups(
                  section.sets.map((s) => ({
                    id: s.id,
                    weight: s.weight,
                    reps: s.reps,
                    position: s.position,
                    isWarmupOverride: s.isWarmupOverride,
                  })),
                ).map((s, i) => {
                  const fullSet = section.sets.find((row) => row.id === s.id);
                  if (!fullSet) return null;
                  const topSet = selectTopSet(section.sets, section.repFloor);
                  return (
                    <SetTableRow
                      key={s.id}
                      index={i + 1}
                      weight={fullSet.weight}
                      reps={fullSet.reps}
                      rir={fullSet.rir}
                      isWarmup={s.isWarmup}
                      isCurrentTopSet={topSet?.id === s.id}
                      improved={section.improved}
                      formatWeight={formatWeight}
                      onOpenEdit={() => setEditingSet({ variantId: section.equipmentVariantId, setId: s.id })}
                      onToggleWarmup={async () => {
                        await updateSet(db, fullSet.id, { isWarmupOverride: !fullSet.isWarmupOverride });
                        load();
                      }}
                    />
                  );
                })}
              </View>
            )}

            <Pressable
              style={styles.addSetRow}
              onPress={() => setEditingSet({ variantId: section.equipmentVariantId, setId: null })}
            >
              <Feather name="plus" size={14} color={colors.accent} />
              <Text style={styles.addSetLabel}>Add set</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.addExerciseRow} onPress={() => setAddExerciseVisible(true)}>
          <Feather name="plus" size={16} color={colors.textSecondary} />
          <Text style={styles.addExerciseLabel}>Add exercise</Text>
        </Pressable>
      </ScrollView>

      <GymSwitcherModal
        visible={gymSwitcherVisible}
        gyms={gyms}
        currentGymId={session.gymId}
        onClose={() => setGymSwitcherVisible(false)}
        onSelect={async (gym) => {
          await updateSessionGym(db, session.id, gym.id);
          setGymSwitcherVisible(false);
          load();
        }}
        onCreate={(name) => createGym(db, { name })}
      />

      <DateEditModal
        visible={dateEditVisible}
        date={session.date}
        onClose={() => setDateEditVisible(false)}
        onSave={async (next) => {
          await updateSessionDate(db, session.id, next);
          setDateEditVisible(false);
          load();
        }}
      />

      <AddExerciseModal
        visible={addExerciseVisible}
        onClose={() => setAddExerciseVisible(false)}
        onSelect={async (exercise) => {
          const rememberedBrand = await getLastUsedBrand(db, exercise.id, session.gymId);
          const variant = await findOrCreateEquipmentVariant(db, {
            exerciseId: exercise.id,
            gymId: session.gymId,
            brand: rememberedBrand,
          });
          await addExerciseToSession(db, {
            sessionId: session.id,
            exerciseId: exercise.id,
            equipmentVariantId: variant.id,
          });
          setAddExerciseVisible(false);
          load();
        }}
      />

      {editingSection && (
        <EditSetModal
          visible={editingSet !== null}
          index={editingIndex}
          title={editingSet?.setId ? undefined : 'Add set'}
          weight={editingSetRow ? formatWeight(editingSetRow.weight) : 0}
          reps={editingSetRow?.reps ?? 0}
          rir={editingSetRow?.rir ?? 0}
          weightStep={editingSection.weightStepDisplay}
          onClose={() => setEditingSet(null)}
          onSave={async ({ weight, reps, rir }) => {
            const weightLb = toLb(weight, unit);
            if (editingSet?.setId) {
              await updateSet(db, editingSet.setId, { weight: weightLb, reps: Math.round(reps), rir });
            } else if (editingSet) {
              await logSet(db, {
                sessionId: session.id,
                equipmentVariantId: editingSet.variantId,
                weight: weightLb,
                reps: Math.round(reps),
                rir,
              });
            }
            setEditingSet(null);
            load();
          }}
          // Only an already-logged set can be deleted; the same modal opened as "Add
          // set" has nothing to remove yet, so it gets no delete control at all.
          onDelete={
            editingSet?.setId
              ? async () => {
                  const setId = editingSet.setId!;
                  setEditingSet(null);
                  await deleteSet(db, setId);
                  load();
                }
              : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary, flex: 1, textAlign: 'center' },
  metaRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface3,
    borderRadius: 20,
  },
  metaPillLabel: { fontSize: 12, color: colors.textSecondary },
  content: { padding: 16 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: colors.surface1, borderRadius: 14, padding: 16, marginBottom: 16 },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  exerciseName: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  removeButton: { paddingLeft: 8 },
  brandLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  setsList: { gap: 6, marginBottom: 6 },
  addSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addSetLabel: { fontSize: 14, color: colors.accent, fontWeight: '500' },
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
