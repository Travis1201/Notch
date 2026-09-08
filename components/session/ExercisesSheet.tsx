import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import type { SessionExerciseVM } from '../../store/activeSessionStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  exercises: SessionExerciseVM[]; // already ordered by position
  currentSessionExerciseId: string | null;
  onJumpTo: (id: string) => void;
  onSkip: (id: string) => void;
  onUnskip: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onAddExercise: () => void;
  onFinish: () => void;
}

// Consolidates jump-to-exercise, skip/unskip, reorder, and add-exercise into one
// sheet reachable from the header — CLAUDE.md "Mid-workout flexibility" requires all
// of these mid-session, but notch-ui-mockups.html's single-exercise-focused layout
// has no room for per-exercise inline controls, so they live here instead.
export function ExercisesSheet({
  visible,
  onClose,
  exercises,
  currentSessionExerciseId,
  onJumpTo,
  onSkip,
  onUnskip,
  onMove,
  onAddExercise,
  onFinish,
}: Props) {
  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>This workout</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <View style={[styles.row, item.id === currentSessionExerciseId && styles.rowCurrent]}>
              <Pressable style={styles.rowMain} onPress={() => onJumpTo(item.id)}>
                <Text style={[styles.rowName, item.status === 'skipped' && styles.muted]}>
                  {item.name}
                </Text>
                {item.status === 'skipped' && <Text style={styles.skippedLabel}>Skipped</Text>}
              </Pressable>
              <View style={styles.rowActions}>
                <Pressable
                  hitSlop={6}
                  disabled={index === 0}
                  onPress={() => onMove(item.id, 'up')}
                  style={styles.moveButton}
                >
                  <Text style={[styles.moveLabel, index === 0 && styles.disabled]}>↑</Text>
                </Pressable>
                <Pressable
                  hitSlop={6}
                  disabled={index === exercises.length - 1}
                  onPress={() => onMove(item.id, 'down')}
                  style={styles.moveButton}
                >
                  <Text style={[styles.moveLabel, index === exercises.length - 1 && styles.disabled]}>
                    ↓
                  </Text>
                </Pressable>
                {item.status === 'skipped' ? (
                  <Pressable hitSlop={6} onPress={() => onUnskip(item.id)}>
                    <Text style={styles.actionLabel}>Resume</Text>
                  </Pressable>
                ) : (
                  <Pressable hitSlop={6} onPress={() => onSkip(item.id)}>
                    <Text style={styles.actionLabel}>Skip</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No exercises added yet.</Text>}
        />

        <Pressable style={styles.addRow} onPress={onAddExercise}>
          <Text style={styles.addLabel}>+ Add exercise</Text>
        </Pressable>
        <Pressable style={styles.finishButton} onPress={onFinish}>
          <Text style={styles.finishLabel}>Finish workout</Text>
        </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowCurrent: { backgroundColor: colors.surface3 },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, color: colors.textPrimary },
  muted: { color: colors.textMuted },
  skippedLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  moveButton: { paddingHorizontal: 2 },
  moveLabel: { fontSize: 15, color: colors.textSecondary },
  disabled: { color: colors.border },
  actionLabel: { fontSize: 13, color: colors.accent },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
  addRow: { padding: 16, borderTopWidth: 0.5, borderTopColor: colors.border },
  addLabel: { fontSize: 15, color: colors.accent, fontWeight: '500' },
  finishButton: {
    margin: 16,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
