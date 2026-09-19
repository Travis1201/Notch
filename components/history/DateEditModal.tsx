import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { NumberStepper } from '../session/NumberStepper';

interface Props {
  visible: boolean;
  date: Date;
  onSave: (next: Date) => void;
  onClose: () => void;
}

// CLAUDE.md "History editing": "Correcting a session's gym or date." Plain
// month/day/year steppers rather than a native date picker — this project avoids
// adding native dependencies it can't test on a device before shipping (see the
// active workout screen's gesture-library saga), and steppers reuse a component
// that's already built and proven.
export function DateEditModal({ visible, date, onSave, onClose }: Props) {
  const [month, setMonth] = useState(date.getMonth() + 1);
  const [day, setDay] = useState(date.getDate());
  const [year, setYear] = useState(date.getFullYear());

  useEffect(() => {
    if (visible) {
      setMonth(date.getMonth() + 1);
      setDay(date.getDate());
      setYear(date.getFullYear());
    }
  }, [visible, date]);

  function handleSave() {
    const next = new Date(date);
    next.setFullYear(year, month - 1, day);
    onSave(next);
  }

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit date</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.stepperRow}>
            <NumberStepper label="Month" value={month} step={1} min={1} onChange={(v) => setMonth(Math.min(12, Math.max(1, Math.round(v))))} />
            <NumberStepper label="Day" value={day} step={1} min={1} onChange={(v) => setDay(Math.min(31, Math.max(1, Math.round(v))))} />
            <NumberStepper label="Year" value={year} step={1} min={2000} onChange={(v) => setYear(Math.round(v))} />
          </View>

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveLabel}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  content: { padding: 16, gap: 16 },
  stepperRow: { flexDirection: 'row', gap: 8 },
  saveButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
