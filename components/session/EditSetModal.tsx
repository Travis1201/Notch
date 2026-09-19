import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../../constants/theme';
import { NumberStepper } from './NumberStepper';
import { RirSelector } from './RirSelector';

interface Props {
  visible: boolean;
  index: number; // 1-based, used in the default title ("Edit set 3")
  title?: string; // overrides the default, e.g. "Add set" for a brand-new row
  weight: number; // display units
  reps: number;
  rir: number;
  weightStep: number;
  onSave: (patch: { weight: number; reps: number; rir: number }) => void;
  onDelete?: () => void; // omitted for a row that isn't logged yet — nothing to delete
  onClose: () => void;
}

// A logged set opens in a popup to edit, rather than in place in the row — an inline
// edit left the keyboard covering the field whenever the exercise card was near the
// bottom of the scroll (there's no way to see what you're typing for the last
// exercise in a long session). A pageSheet modal isn't pinned to the row's scroll
// position, so it stays clear of the keyboard regardless of where the card sits.
// "Logged is never the same as locked" (CLAUDE.md "Active workout screen") still
// holds — this is still available for the life of the session, just via a popup.
export function EditSetModal({
  visible,
  index,
  title,
  weight,
  reps,
  rir,
  weightStep,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [draftWeight, setDraftWeight] = useState(weight);
  const [draftReps, setDraftReps] = useState(reps);
  const [draftRir, setDraftRir] = useState(rir);

  useEffect(() => {
    if (visible) {
      setDraftWeight(weight);
      setDraftReps(reps);
      setDraftRir(rir);
    }
  }, [visible, weight, reps, rir]);

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title ?? `Edit set ${index}`}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.stepperRow}>
            <NumberStepper label="Weight" value={draftWeight} step={weightStep} onChange={setDraftWeight} />
            <NumberStepper label="Reps" value={draftReps} step={1} onChange={setDraftReps} />
          </View>

          <RirSelector value={draftRir} onChange={setDraftRir} />

          <Pressable
            style={styles.saveButton}
            onPress={() => onSave({ weight: draftWeight, reps: draftReps, rir: draftRir })}
          >
            <Text style={styles.saveLabel}>Save</Text>
          </Pressable>

          {/* Deleting a set lives here rather than as a per-row button or a swipe.
              The mockup's set rows carry no controls, and a mis-tapped delete on a
              sweaty one-handed screen is worse than one extra tap to reach it — so
              the row is a single tap target and this is the one destructive control
              behind it, confirmed. */}
          {onDelete && (
            <Pressable
              style={styles.deleteButton}
              onPress={() =>
                Alert.alert('Delete this set?', 'It will be removed from this workout.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDelete },
                ])
              }
            >
              <Text style={styles.deleteLabel}>Delete set</Text>
            </Pressable>
          )}
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
    borderRadius: radii.button,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveLabel: { fontSize: 15, fontWeight: '600', color: colors.onAccent },
  deleteButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { fontSize: 15, color: colors.textError },
});
