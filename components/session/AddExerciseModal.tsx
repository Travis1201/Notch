import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  listExercises,
  listRecentOrFrequentExercises,
  searchExercises,
  createExercise,
} from '../../db/queries/exercises';
import type { Exercise } from '../../db/types';
import { groupByMuscleGroup, type ExerciseSection } from '../../lib/groupExercises';
import { ExerciseForm } from '../exercises/ExerciseForm';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
}

const RECENT_SECTION_TITLE = 'Recent';

// CLAUDE.md "Mid-workout flexibility": "The exercise picker must be browsable, not
// search-only." An empty query used to hand the whole list to
// listRecentOrFrequentExercises, which is empty by construction for any session/user
// with no prior history — reading as "No exercises found" even though the full seed
// library exists. Fix: empty query browses the full grouped library (Recent first,
// when there is any), and the search field filters that same list live.
export function AddExerciseModal({ visible, onClose, onSelect }: Props) {
  const db = useDatabase();
  const [query, setQuery] = useState('');
  const [sections, setSections] = useState<ExerciseSection[]>([]);
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setShowCreateForm(false);
    setCreateError(null);
    Promise.all([listRecentOrFrequentExercises(db, { limit: 10 }), listExercises(db)]).then(
      ([recent, all]) => {
        const recentIds = new Set(recent.map((e) => e.id));
        const grouped = groupByMuscleGroup(all.filter((e) => !recentIds.has(e.id)));
        setSections(recent.length > 0 ? [{ title: RECENT_SECTION_TITLE, data: recent }, ...grouped] : grouped);
      },
    );
  }, [visible, db]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!visible || !trimmedQuery) {
      setSearchResults([]);
      return;
    }
    searchExercises(db, trimmedQuery, { limit: 50 }).then(setSearchResults);
  }, [trimmedQuery, visible, db]);

  function renderRow(exercise: Exercise) {
    return (
      <Pressable style={styles.resultRow} onPress={() => onSelect(exercise)}>
        <Text style={styles.resultName}>{exercise.name}</Text>
        <Text style={styles.resultMeta}>{exercise.muscleGroup}</Text>
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add exercise</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        {showCreateForm ? (
          <ExerciseForm
            nameError={createError}
            onNameChange={() => setCreateError(null)}
            onCancel={() => setShowCreateForm(false)}
            onSubmit={async (input) => {
              try {
                const exercise = await createExercise(db, input);
                onSelect(exercise);
              } catch (e) {
                setCreateError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
        ) : (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
            />
            {trimmedQuery ? (
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
                stickySectionHeadersEnabled={false}
              />
            )}
            <Pressable
              style={styles.createRow}
              onPress={() => {
                setCreateError(null);
                setShowCreateForm(true);
              }}
            >
              <Text style={styles.createLabel}>+ Create new exercise</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  closeLabel: { fontSize: 15, color: colors.accent },
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
  sectionHeader: { backgroundColor: colors.surface3, paddingHorizontal: 16, paddingVertical: 6 },
  sectionHeaderLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  resultName: { fontSize: 15, color: colors.textPrimary },
  resultMeta: { fontSize: 12, color: colors.textMuted },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
  createRow: {
    padding: 16,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  createLabel: { fontSize: 15, color: colors.accent, fontWeight: '500' },
});
