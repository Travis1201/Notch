import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { listExercises, searchExercises, createExercise } from '../../db/queries/exercises';
import type { Exercise } from '../../db/types';
import { ExerciseForm } from '../../components/exercises/ExerciseForm';

interface Section {
  title: string;
  data: Exercise[];
}

function groupByMuscleGroup(exerciseList: Exercise[]): Section[] {
  const byGroup = new Map<string, Exercise[]>();
  for (const exercise of exerciseList) {
    const list = byGroup.get(exercise.muscleGroup);
    if (list) list.push(exercise);
    else byGroup.set(exercise.muscleGroup, [exercise]);
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, data]) => ({ title, data }));
}

export default function ExercisesScreen() {
  const db = useDatabase();
  const router = useRouter();

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setAllExercises(await listExercises(db));
    setLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    searchExercises(db, trimmedQuery, { limit: 200 }).then((results) => {
      if (!cancelled) setSearchResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmedQuery, db]);

  const sections = useMemo(() => groupByMuscleGroup(allExercises), [allExercises]);

  function renderRow(exercise: Exercise) {
    return (
      <Pressable style={styles.row} onPress={() => router.push(`/exercise/${exercise.id}`)}>
        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{exercise.name}</Text>
          <Text style={styles.rowMeta}>
            {exercise.muscleGroup} · {exercise.equipmentType}
          </Text>
        </View>
        {exercise.isCustom && (
          <View style={styles.customPill}>
            <Text style={styles.customPillLabel}>Custom</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercises</Text>
        <Pressable onPress={() => setCreateModalVisible(true)} hitSlop={8}>
          <Text style={styles.newLabel}>+ New</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search exercises"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
      />

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : trimmedQuery ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={<Text style={styles.emptyText}>No exercises found.</Text>}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderRow(item)}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderLabel}>{section.title}</Text>
            </View>
          )}
        />
      )}

      <Modal
        visible={createModalVisible}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.createModalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>New exercise</Text>
            <Pressable onPress={() => setCreateModalVisible(false)} hitSlop={8}>
              <Text style={styles.newLabel}>Close</Text>
            </Pressable>
          </View>
          <ExerciseForm
            onCancel={() => setCreateModalVisible(false)}
            onSubmit={async (values) => {
              await createExercise(db, values);
              setCreateModalVisible(false);
              reload();
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  newLabel: { fontSize: 15, color: colors.accent, fontWeight: '500' },
  searchInput: {
    margin: 16,
    height: 44,
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
  },
  loading: { marginTop: 24 },
  sectionHeader: { backgroundColor: colors.surface2, paddingHorizontal: 16, paddingVertical: 6 },
  sectionHeaderLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  customPill: {
    backgroundColor: colors.accentTintBg,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  customPillLabel: { fontSize: 11, color: colors.accentLight },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
  createModalContainer: { flex: 1, backgroundColor: colors.surface1 },
});
