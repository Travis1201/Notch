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
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { listExercises, searchExercises, createExercise } from '../../db/queries/exercises';
import type { Exercise } from '../../db/types';
import { groupByMuscleGroup } from '../../lib/groupExercises';
import { ExerciseForm } from '../../components/exercises/ExerciseForm';

export default function ExercisesScreen() {
  const db = useDatabase();
  const router = useRouter();

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Exercises</Text>
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
            <Pressable
              onPress={() => {
                setCreateModalVisible(false);
                setCreateError(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.newLabel}>Close</Text>
            </Pressable>
          </View>
          <ExerciseForm
            nameError={createError}
            onNameChange={() => setCreateError(null)}
            onCancel={() => {
              setCreateModalVisible(false);
              setCreateError(null);
            }}
            onSubmit={async (values) => {
              try {
                await createExercise(db, values);
                setCreateModalVisible(false);
                setCreateError(null);
                reload();
              } catch (e) {
                setCreateError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  screenTitle: { fontSize: 22, fontWeight: '500', color: colors.textPrimary },
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
    backgroundColor: colors.surface3,
  },
  loading: { marginTop: 24 },
  sectionHeader: { backgroundColor: colors.surface3, paddingHorizontal: 16, paddingVertical: 6 },
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
