import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { listRecentOrFrequentExercises, searchExercises, createExercise } from '../../db/queries/exercises';
import type { Exercise } from '../../db/types';
import { CreateExerciseForm } from './CreateExerciseForm';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
}

// CLAUDE.md "Mid-workout flexibility": a search sheet with recent/most-frequent
// exercises listed first; one tap adds it. "Create new exercise" sits at the bottom.
export function AddExerciseModal({ visible, onClose, onSelect }: Props) {
  const db = useDatabase();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Exercise[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setShowCreateForm(false);
    listRecentOrFrequentExercises(db, { limit: 10 }).then(setResults);
  }, [visible, db]);

  useEffect(() => {
    if (!visible) return;
    if (!query.trim()) {
      listRecentOrFrequentExercises(db, { limit: 10 }).then(setResults);
      return;
    }
    searchExercises(db, query, { limit: 20 }).then(setResults);
  }, [query, visible, db]);

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
          <CreateExerciseForm
            onCancel={() => setShowCreateForm(false)}
            onCreate={async (input) => {
              const exercise = await createExercise(db, input);
              onSelect(exercise);
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
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={styles.resultRow} onPress={() => onSelect(item)}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  <Text style={styles.resultMeta}>{item.muscleGroup}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No exercises found.</Text>}
            />
            <Pressable style={styles.createRow} onPress={() => setShowCreateForm(true)}>
              <Text style={styles.createLabel}>+ Create new exercise</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface1 },
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
    backgroundColor: colors.surface2,
  },
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
