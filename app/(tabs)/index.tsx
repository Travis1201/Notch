import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { getInProgressSession, startEmptySession, autoCloseStaleSessions } from '../../db/queries/sessions';
import { getDefaultGym } from '../../db/queries/gyms';
import { seedTestData } from '../../db/dev/seedTestData';
import type { Session } from '../../db/types';

export default function HomeScreen() {
  const db = useDatabase();
  const router = useRouter();
  const [inProgressSession, setInProgressSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      autoCloseStaleSessions(db)
        .then(() => getInProgressSession(db))
        .then((session) => {
          if (!cancelled) {
            setInProgressSession(session);
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  async function handleStartEmptyWorkout() {
    const gym = await getDefaultGym(db);
    if (!gym) return;
    const session = await startEmptySession(db, { gymId: gym.id });
    router.push(`/session/${session.id}`);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>

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
        <Pressable style={styles.primaryButton} onPress={handleStartEmptyWorkout}>
          <Text style={styles.primaryButtonLabel}>Start empty workout</Text>
        </Pressable>
      )}

      {__DEV__ && (
        <Pressable
          style={styles.devButton}
          onPress={async () => {
            await seedTestData(db);
          }}
        >
          <Text style={styles.devButtonLabel}>Seed test data (dev only)</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface1,
    gap: 20,
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
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
