import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { getInProgressSession, startEmptySession, autoCloseStaleSessions } from '../../db/queries/sessions';
import { listGyms, createGym, getLastUsedGym } from '../../db/queries/gyms';
import { seedTestData } from '../../db/dev/seedTestData';
import type { Gym, Session } from '../../db/types';
import { GymSwitcherModal } from '../../components/gyms/GymSwitcherModal';

export default function HomeScreen() {
  const db = useDatabase();
  const router = useRouter();
  const [inProgressSession, setInProgressSession] = useState<Session | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [gymSwitcherVisible, setGymSwitcherVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        autoCloseStaleSessions(db).then(() => getInProgressSession(db)),
        getLastUsedGym(db),
        listGyms(db),
      ]).then(([session, lastUsedGym, allGyms]) => {
        if (cancelled) return;
        setInProgressSession(session);
        setGym(lastUsedGym);
        setGyms(allGyms);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  async function handleStartEmptyWorkout() {
    if (!gym) return;
    const session = await startEmptySession(db, { gymId: gym.id });
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Home</Text>
        {gym && (
          <Pressable style={styles.gymPill} onPress={() => setGymSwitcherVisible(true)}>
            <Text style={styles.gymPillLabel}>{gym.name}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : inProgressSession ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push(`/session/${inProgressSession.id}`)}
          >
            <Text style={styles.primaryButtonLabel}>Resume workout</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryButton} onPress={handleStartEmptyWorkout} disabled={!gym}>
            <Text style={styles.primaryButtonLabel}>Start empty workout</Text>
          </Pressable>
        )}

        {__DEV__ && (
          <Pressable style={styles.devButton} onPress={handleSeedTestData} disabled={seeding}>
            <Text style={styles.devButtonLabel}>
              {seeding ? 'Seeding…' : 'Seed test data (dev only)'}
            </Text>
          </Pressable>
        )}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
  gymPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.surface3,
    borderRadius: 20,
  },
  gymPillLabel: { fontSize: 12, color: colors.textSecondary },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  primaryButton: {
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  devButton: { marginTop: 40, padding: 10 },
  devButtonLabel: { fontSize: 12, color: colors.textMuted },
});
