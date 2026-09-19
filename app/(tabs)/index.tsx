import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { colors, numeric, radii } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import type { Database } from '../../db/client';
import {
  getInProgressSession,
  startEmptySession,
  startTemplateSession,
  autoCloseStaleSessions,
  getLastCompletedSession,
  getLastCompletedSessionForTemplate,
} from '../../db/queries/sessions';
import { getSessionImprovementCount, getLatestTopSet } from '../../db/queries/sets';
import { listTemplates, getTemplateExercises } from '../../db/queries/templates';
import { getLastUsedVariant } from '../../db/queries/equipmentVariants';
import { getExercise } from '../../db/queries/exercises';
import { getSettings } from '../../db/queries/settings';
import { listGyms, createGym, getLastUsedGym } from '../../db/queries/gyms';
import { seedTestData } from '../../db/dev/seedTestData';
import { resetDatabase } from '../../db/dev/resetDatabase';
import type { Gym, Session, Settings, Template } from '../../db/types';
import { resolveRepFloor } from '../../lib/exerciseDefaults';
import { fromLb } from '../../lib/units';
import { templateDotColor } from '../../lib/templateColor';
import { GymSwitcherModal } from '../../components/gyms/GymSwitcherModal';

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MAX_HERO_EXERCISES = 3;

interface TemplateSummary {
  template: Template;
  lastSession: Session | null;
  improvementCount: number;
}

interface HeroExercisePreview {
  name: string;
  topSetLabel: string | null;
}

// Template rows' "4 days ago" — CLAUDE.md "Visual design > Home screen". Casual
// relative framing; History has exact dates.
function daysAgoLabel(date: Date | null, neverLabel: string): string {
  if (!date) return neverLabel;
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function lastLiftedLabel(date: Date | null): string {
  if (!date) return 'No workouts yet';
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Last lifted today';
  if (days === 1) return 'Last lifted yesterday';
  return `Last lifted ${days} days ago`;
}

async function loadTemplateSummaries(db: Database): Promise<TemplateSummary[]> {
  const all = await listTemplates(db);
  return Promise.all(
    all.map(async (template) => {
      const lastSession = await getLastCompletedSessionForTemplate(db, template.id);
      const improvementCount = lastSession ? await getSessionImprovementCount(db, lastSession.id) : 0;
      return { template, lastSession, improvementCount };
    }),
  );
}

// The template longest-since-performed is the hero — CLAUDE.md "Home screen": "This
// is ordering by recency, not recommending a program." Never-performed sorts first
// (most overdue of all).
function sortByMostOverdue(summaries: TemplateSummary[]): TemplateSummary[] {
  return [...summaries].sort((a, b) => {
    const aTime = a.lastSession ? a.lastSession.date.getTime() : -Infinity;
    const bTime = b.lastSession ? b.lastSession.date.getTime() : -Infinity;
    return aTime - bTime;
  });
}

async function loadHeroExercisePreviews(
  db: Database,
  templateId: string,
  gymId: string,
  settings: Settings,
): Promise<HeroExercisePreview[]> {
  const rows = await getTemplateExercises(db, templateId);
  return Promise.all(
    rows.map(async (row) => {
      const variant = await getLastUsedVariant(db, row.exerciseId, gymId);
      let topSetLabel: string | null = null;
      if (variant) {
        const exercise = await getExercise(db, row.exerciseId);
        const repFloor = exercise ? resolveRepFloor(exercise, settings) : 1;
        const topSet = await getLatestTopSet(db, variant.id, repFloor);
        if (topSet) topSetLabel = `${fromLb(topSet.weight, settings.unitPreference)} × ${topSet.reps}`;
      }
      return { name: row.exercise.name, topSetLabel };
    }),
  );
}

export default function HomeScreen() {
  const db = useDatabase();
  const router = useRouter();
  const [inProgressSession, setInProgressSession] = useState<Session | null>(null);
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templateSummaries, setTemplateSummaries] = useState<TemplateSummary[]>([]);
  const [heroExercises, setHeroExercises] = useState<HeroExercisePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [gymSwitcherVisible, setGymSwitcherVisible] = useState(false);

  const loadHomeState = useCallback(async () => {
    const [session, lastCompleted, lastUsedGym, allGyms, settingsRow, summaries] = await Promise.all([
      autoCloseStaleSessions(db).then(() => getInProgressSession(db)),
      getLastCompletedSession(db),
      getLastUsedGym(db),
      listGyms(db),
      getSettings(db),
      loadTemplateSummaries(db),
    ]);
    setInProgressSession(session);
    setLastSession(lastCompleted);
    setGym(lastUsedGym);
    setGyms(allGyms);
    setSettings(settingsRow);
    setTemplateSummaries(summaries);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadHomeState().then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [loadHomeState]),
  );

  const sortedSummaries = sortByMostOverdue(templateSummaries);
  const heroSummary = !inProgressSession && sortedSummaries.length > 0 ? sortedSummaries[0] : null;
  const otherSummaries = sortedSummaries.filter((s) => s.template.id !== heroSummary?.template.id);

  useEffect(() => {
    if (!heroSummary || !gym || !settings) {
      setHeroExercises([]);
      return;
    }
    let cancelled = false;
    loadHeroExercisePreviews(db, heroSummary.template.id, gym.id, settings).then((previews) => {
      if (!cancelled) setHeroExercises(previews);
    });
    return () => {
      cancelled = true;
    };
  }, [db, heroSummary?.template.id, gym?.id, settings]);

  async function handleStartEmptyWorkout() {
    if (!gym) return;
    const session = await startEmptySession(db, { gymId: gym.id });
    router.push(`/session/${session.id}`);
  }

  async function handleStartTemplate(templateId: string) {
    if (!gym) return;
    const session = await startTemplateSession(db, { gymId: gym.id, templateId });
    router.push(`/session/${session.id}`);
  }

  async function handleCreateGym(name: string) {
    const newGym = await createGym(db, { name });
    setGyms((prev) => [...prev, newGym].sort((a, b) => a.name.localeCompare(b.name)));
    return newGym;
  }

  async function handleSeedTestData() {
    setSeeding(true);
    try {
      const before = (await db.query.sessions.findMany()).length;
      await seedTestData(db);
      const after = (await db.query.sessions.findMany()).length;
      if (before > 0) {
        Alert.alert('Already seeded', `${before} session(s) already exist — seeding is skipped once anything's there.`);
      } else if (after === before) {
        Alert.alert('Seed ran but inserted nothing', "Couldn't find Chest press / Back squat in the exercise list.");
      } else {
        Alert.alert('Seeded', `Inserted ${after - before} fake past session(s).`);
      }
    } catch (e) {
      Alert.alert('Seeding failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }

  // Dev-only: ensureSeedExercises (db/bootstrap.ts) only ever inserts the seed list
  // once, so an install from before a seed-list change is stuck on the old one. This
  // wipes the local database and re-bootstraps — see db/dev/resetDatabase.ts.
  function handleResetDatabase() {
    Alert.alert(
      'Reset app data?',
      'Deletes every gym, exercise, template, and session on this device, then re-seeds from scratch. This is a dev tool — there is no real user data to lose yet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetDatabase(db);
              await loadHomeState();
              Alert.alert('Reset complete', 'The exercise library was re-seeded from notch-seed-exercises.csv.');
            } catch (e) {
              Alert.alert('Reset failed', e instanceof Error ? e.message : String(e));
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }

  const visibleHeroExercises = heroExercises.slice(0, MAX_HERO_EXERCISES);
  const hiddenHeroExerciseCount = heroExercises.length - visibleHeroExercises.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.dayName}>{WEEKDAY_FORMAT.format(new Date())}</Text>
          <Text style={styles.lastLifted}>{lastLiftedLabel(lastSession?.date ?? null)}</Text>
        </View>
        {gym && (
          <Pressable style={styles.gymPill} onPress={() => setGymSwitcherVisible(true)}>
            <Feather name="map-pin" size={12} color={colors.textSecondary} />
            <Text style={styles.gymPillLabel}>{gym.name}</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loadingIndicator} />
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <View style={styles.hero}>
            {inProgressSession ? (
              <>
                <Text style={styles.heroTitle}>Workout in progress</Text>
                <Text style={styles.heroSubtitle}>Tap to keep logging</Text>
                <Pressable
                  style={styles.heroButton}
                  onPress={() => router.push(`/session/${inProgressSession.id}`)}
                >
                  <Feather name="play" size={17} color={colors.accent} />
                  <Text style={styles.heroButtonLabel}>Resume workout</Text>
                </Pressable>
              </>
            ) : heroSummary ? (
              <>
                <View style={styles.heroTopRow}>
                  <Text style={styles.heroTitle}>{heroSummary.template.name}</Text>
                  <Text style={styles.heroMeta}>
                    {daysAgoLabel(heroSummary.lastSession?.date ?? null, 'Never performed')}
                  </Text>
                </View>
                <View style={styles.heroExerciseList}>
                  {visibleHeroExercises.map((ex) => (
                    <View key={ex.name} style={styles.heroExerciseRow}>
                      <Text style={styles.heroExerciseName}>{ex.name}</Text>
                      {ex.topSetLabel && <Text style={styles.heroExerciseValue}>{ex.topSetLabel}</Text>}
                    </View>
                  ))}
                  {hiddenHeroExerciseCount > 0 && (
                    <Text style={styles.heroMoreLabel}>+ {hiddenHeroExerciseCount} more</Text>
                  )}
                </View>
                <Pressable style={styles.heroButton} onPress={() => handleStartTemplate(heroSummary.template.id)}>
                  <Feather name="play" size={17} color={colors.accent} />
                  <Text style={styles.heroButtonLabel}>Start workout</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>Create your first template</Text>
                <Text style={styles.heroSubtitle}>
                  Templates pre-fill every exercise from last time automatically
                </Text>
                <Pressable style={styles.heroButton} onPress={() => router.push('/template/new')}>
                  <Feather name="plus" size={17} color={colors.accent} />
                  <Text style={styles.heroButtonLabel}>Create template</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.rowList}>
            {otherSummaries.map((summary) => (
              <View key={summary.template.id} style={styles.templateRow}>
                <Pressable
                  style={({ pressed }) => [styles.templateRowMain, pressed && styles.rowPressed]}
                  onPress={() => handleStartTemplate(summary.template.id)}
                >
                  <View style={[styles.dot, { backgroundColor: templateDotColor(summary.template.id) }]} />
                  <Text style={styles.templateRowName}>{summary.template.name}</Text>
                  {summary.improvementCount > 0 && (
                    <View style={styles.improvementBadge}>
                      <Feather name="arrow-up-right" size={13} color={colors.textSuccess} />
                      <Text style={styles.improvementCount}>{summary.improvementCount}</Text>
                    </View>
                  )}
                  <Text style={styles.templateRowDate}>
                    {daysAgoLabel(summary.lastSession?.date ?? null, 'Never')}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={8}
                  style={styles.editButton}
                  onPress={() => router.push(`/template/${summary.template.id}`)}
                >
                  <Feather name="edit-2" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [styles.plainRow, pressed && styles.rowPressed]}
              onPress={() => router.push('/template/new')}
            >
              <Feather name="plus" size={15} color={colors.textMuted} />
              <Text style={styles.plainRowLabel}>Create template</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.plainRow, pressed && styles.rowPressed]}
              onPress={handleStartEmptyWorkout}
              disabled={!gym}
            >
              <Feather name="plus" size={15} color={colors.textMuted} />
              <Text style={styles.plainRowLabel}>Empty workout</Text>
            </Pressable>
          </View>

          {__DEV__ && (
            <View style={styles.devButtonGroup}>
              <Pressable style={styles.devButton} onPress={handleSeedTestData} disabled={seeding}>
                <Text style={styles.devButtonLabel}>
                  {seeding ? 'Seeding…' : 'Seed test data (dev only)'}
                </Text>
              </Pressable>
              <Pressable style={styles.devButton} onPress={handleResetDatabase} disabled={resetting}>
                <Text style={styles.devButtonLabelDanger}>
                  {resetting ? 'Resetting…' : 'Reset app data (dev only)'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      <GymSwitcherModal
        visible={gymSwitcherVisible}
        gyms={gyms}
        currentGymId={gym?.id ?? null}
        onClose={() => setGymSwitcherVisible(false)}
        onSelect={(selected) => {
          setGym(selected);
          setGymSwitcherVisible(false);
        }}
        onCreate={handleCreateGym}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  dayName: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3, color: colors.textPrimary, marginBottom: 2 },
  lastLifted: { fontSize: 13, color: colors.textMuted },
  gymPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
  },
  gymPillLabel: { fontSize: 12, color: colors.textSecondary },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 18, paddingBottom: 24 },
  loadingIndicator: { marginTop: 60 },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    padding: 18,
    marginTop: 18,
    marginBottom: 20,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 },
  heroTitle: { fontSize: 24, fontWeight: '700', color: colors.onAccent },
  heroMeta: { fontSize: 12, color: colors.onAccentMuted },
  heroSubtitle: { fontSize: 12, color: colors.onAccentMuted, marginTop: 4, marginBottom: 18 },
  heroExerciseList: { marginBottom: 18 },
  heroExerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.onAccentBorder,
  },
  heroExerciseName: { fontSize: 13, color: colors.onAccentMuted },
  heroExerciseValue: { ...numeric.inline, color: colors.onAccent },
  heroMoreLabel: { fontSize: 13, color: colors.onAccentSubtle, paddingTop: 7 },
  heroButton: {
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.onAccent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  heroButtonLabel: { fontSize: 15, fontWeight: '600', color: colors.accent },
  rowList: { paddingBottom: 4 },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  templateRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  // The ladder's third step, shown while a finger is down. Instant, not animated —
  // the PR pulse is the app's only deliberate motion.
  rowPressed: { backgroundColor: colors.surfaceRaised },
  dot: { width: 8, height: 8, borderRadius: 4 },
  templateRowName: { fontSize: 16, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  improvementBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  improvementCount: { ...numeric.small, fontWeight: '600', color: colors.textSuccess },
  templateRowDate: { fontSize: 12, color: colors.textMuted, width: 68, textAlign: 'right' },
  editButton: { padding: 8 },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
  },
  plainRowLabel: { fontSize: 15, color: colors.textSecondary },
  devButtonGroup: { alignItems: 'center', marginTop: 24 },
  devButton: { padding: 10 },
  devButtonLabel: { fontSize: 12, color: colors.textMuted },
  devButtonLabelDanger: { fontSize: 12, color: colors.textError },
});
