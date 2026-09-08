import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/theme';
import type { Gym } from '../../db/types';

interface Props {
  visible: boolean;
  gyms: Gym[];
  currentGymId: string | null;
  onSelect: (gym: Gym) => void;
  onCreate: (name: string) => Promise<Gym>;
  onClose: () => void;
}

// CLAUDE.md "Visual design > Home screen": "Gym selector is a small pill in the
// header. Single-gym users read it as a label." This is the sheet that pill opens —
// pick an existing gym, or add a new one (which is how a single-gym install grows
// into a multi-gym one; nothing about the switcher UI is visible until this is used).
export function GymSwitcherModal({ visible, gyms, currentGymId, onSelect, onCreate, onClose }: Props) {
  const [adding, setAdding] = useState(false);
  const [newGymName, setNewGymName] = useState('');

  useEffect(() => {
    if (visible) {
      setAdding(false);
      setNewGymName('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Gyms</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item)}>
              <Text style={[styles.rowLabel, item.id === currentGymId && styles.rowLabelSelected]}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />

        {adding ? (
          <View style={styles.addForm}>
            <TextInput
              style={styles.addInput}
              placeholder="Gym name"
              placeholderTextColor={colors.textMuted}
              value={newGymName}
              onChangeText={setNewGymName}
              autoFocus
            />
            <View style={styles.addFormActions}>
              <Pressable onPress={() => setAdding(false)} style={styles.cancelButton}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const trimmed = newGymName.trim();
                  if (!trimmed) return;
                  const gym = await onCreate(trimmed);
                  onSelect(gym);
                }}
                style={[styles.submitButton, !newGymName.trim() && styles.submitButtonDisabled]}
                disabled={!newGymName.trim()}
              >
                <Text style={styles.submitLabel}>Add gym</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addRow} onPress={() => setAdding(true)}>
            <Text style={styles.addLabel}>+ Add gym</Text>
          </Pressable>
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
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 15, color: colors.textPrimary },
  rowLabelSelected: { color: colors.accent, fontWeight: '600' },
  addRow: { padding: 16, borderTopWidth: 0.5, borderTopColor: colors.border },
  addLabel: { fontSize: 15, color: colors.accent, fontWeight: '500' },
  addForm: { padding: 16, borderTopWidth: 0.5, borderTopColor: colors.border },
  addInput: {
    height: 44,
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
  },
  addFormActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelButton: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 15, color: colors.textSecondary },
  submitButton: {
    flex: 2,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
