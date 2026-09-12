import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { listTrackedVariants, type TrackedVariantSummary } from '../../db/queries/progress';

// CLAUDE.md "Progress tab": "Lands on a searchable list of tracked lifts, sorted by
// most recently trained." Variants with fewer than 2 logged sessions are already
// excluded by listTrackedVariants — nothing to plot yet, so nothing to show yet.
export default function ProgressScreen() {
  const db = useDatabase();
  const router = useRouter();
  const [variants, setVariants] = useState<TrackedVariantSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      listTrackedVariants(db).then((rows) => {
        if (!cancelled) {
          setVariants(rows);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed ? variants.filter((v) => v.exerciseName.toLowerCase().includes(trimmed)) : variants;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Progress</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search exercises"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.variantId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/progress/${item.variantId}`)}>
              <View>
                <Text style={styles.rowName}>{item.exerciseName}</Text>
                <Text style={styles.rowMeta}>
                  {item.brand ? `${item.brand} · ` : ''}
                  {item.gymName}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {variants.length === 0
                ? "A trend needs a couple more sessions on the same exercise + equipment before it shows up here."
                : 'No matches.'}
            </Text>
          }
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
  searchInput: {
    margin: 16,
    height: 44,
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface3,
  },
  loading: { marginTop: 40 },
  listContent: { paddingHorizontal: 18, paddingBottom: 18 },
  row: { paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  rowName: { fontSize: 15, color: colors.textPrimary, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40, lineHeight: 20 },
});
