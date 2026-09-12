import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../constants/theme';
import { formatDurationLabel } from '../../lib/sessionDuration';
import { useDatabase } from '../../db/DatabaseProvider';
import { listCompletedSessions } from '../../db/queries/sessions';
import { listSessionExercises } from '../../db/queries/sessionExercises';
import { getSessionImprovementCount } from '../../db/queries/sets';
import { listGyms } from '../../db/queries/gyms';
import { listTemplates } from '../../db/queries/templates';
import type { Session } from '../../db/types';

interface HistoryRow {
  session: Session;
  gymName: string;
  templateName: string | null;
  exerciseCount: number;
  improvementCount: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// lib/sessionDuration.ts owns the formatting; this only adds the list row's separator
// so a session with no sets (no duration) doesn't leave a dangling " · ".
function durationLabel(seconds: number | null): string {
  const label = formatDurationLabel(seconds);
  return label ? ` · ${label}` : '';
}

// CLAUDE.md "History editing": past sessions are a normal, fully-editable case, not
// an edge case. This is the browse list; app/history/[id].tsx is the edit view.
export default function HistoryScreen() {
  const db = useDatabase();
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([listCompletedSessions(db), listGyms(db), listTemplates(db)]).then(
        async ([sessions, gyms, templates]) => {
          const gymNames = new Map(gyms.map((g) => [g.id, g.name]));
          const templateNames = new Map(templates.map((t) => [t.id, t.name]));

          const built = await Promise.all(
            sessions.map(async (session) => {
              const [exercises, improvementCount] = await Promise.all([
                listSessionExercises(db, session.id),
                getSessionImprovementCount(db, session.id),
              ]);
              return {
                session,
                gymName: gymNames.get(session.gymId) ?? '',
                templateName: session.templateId ? (templateNames.get(session.templateId) ?? null) : null,
                exerciseCount: exercises.length,
                improvementCount,
              };
            }),
          );

          if (!cancelled) {
            setRows(built);
            setLoading(false);
          }
        },
      );
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.session.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/history/${item.session.id}`)}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{item.templateName ?? 'Empty workout'}</Text>
                <Text style={styles.rowMeta}>
                  {DATE_FORMAT.format(item.session.date)} · {item.gymName} · {item.exerciseCount}{' '}
                  {item.exerciseCount === 1 ? 'exercise' : 'exercises'}
                  {durationLabel(item.session.durationSeconds)}
                </Text>
              </View>
              {item.improvementCount > 0 && (
                <View style={styles.improvementBadge}>
                  <Feather name="arrow-up-right" size={13} color={colors.textSuccess} />
                  <Text style={styles.improvementCount}>{item.improvementCount}</Text>
                </View>
              )}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No sessions logged yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '500', color: colors.textPrimary },
  loading: { marginTop: 60 },
  listContent: { padding: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 16, color: colors.textPrimary, marginBottom: 3 },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  improvementBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  improvementCount: { fontSize: 13, color: colors.textSuccess },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
