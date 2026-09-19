import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, numeric, radii } from '../../constants/theme';
import { ConfirmModal } from '../shared/ConfirmModal';
import { formatDurationLabel } from '../../lib/sessionDuration';

// One structural difference between the session and the template it started from.
// "Reordered" is deliberately absent: CLAUDE.md says structure prompts only when it
// actually changed, and reordering mid-session is a pure display preference that must
// not be offered as a template edit.
export interface TemplateChange {
  kind: 'added' | 'removed';
  exerciseId: string;
  name: string;
}

interface Props {
  visible: boolean;
  templateName: string | null; // null for an ad-hoc "empty workout"
  exerciseCount: number;
  setCount: number;
  durationSeconds: number | null;
  changes: TemplateChange[];
  saveChangesToTemplate: boolean;
  onToggleSaveChanges: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

// The Finish confirmation. Two jobs in one screen, because they're one decision from
// the user's side: confirm that the workout is over, and — when the exercise list
// differs from the template it started from — say what changed and offer to keep it.
//
// CLAUDE.md "Templates > Structure changes DO prompt" asks this **once**, on
// completion, and only when structure actually changed. Weights never prompt; there
// are none stored to prompt about, which is the whole reason templates hold structure
// only. This is also why the template question lives here rather than in a second
// dialog after Finish: a second dialog would be two confirmations for one action, and
// the previous version's native Alert could only offer "Just this once" / "Save to
// template" as opaque buttons, with no way to show WHICH exercises it meant.
//
// The toggle defaults to off (see the parent screen). Nothing edits a template unless
// the user says so explicitly — a template is reused every week, and silently
// absorbing one day's improvisation into it is the more expensive mistake.
export function FinishWorkoutModal({
  visible,
  templateName,
  exerciseCount,
  setCount,
  durationSeconds,
  changes,
  saveChangesToTemplate,
  onToggleSaveChanges,
  onConfirm,
  onClose,
}: Props) {
  const durationLabel = formatDurationLabel(durationSeconds);
  const summary = [
    `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`,
    `${setCount} ${setCount === 1 ? 'set' : 'sets'}`,
    durationLabel,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const canEditTemplate = templateName !== null && changes.length > 0;

  return (
    <ConfirmModal
      visible={visible}
      title="Finish this workout?"
      confirmLabel="Finish workout"
      cancelLabel="Keep logging"
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <View style={styles.summaryBlock}>
        <Text style={styles.summaryText}>{summary}</Text>
        {setCount === 0 && (
          // Finishing with nothing logged writes a real, permanent, empty session into
          // History that later sessions get compared against. Cancel is the correct
          // exit in that case, so this says so instead of quietly allowing it.
          <Text style={styles.warningText}>
            No sets logged. This will still be saved to History as an empty workout — use
            Cancel instead if you didn't train.
          </Text>
        )}
      </View>

      {canEditTemplate && (
        <View style={styles.changesBlock}>
          <Text style={styles.changesTitle}>
            You changed {templateName} during this workout
          </Text>

          <View style={styles.changeList}>
            {changes.map((change) => (
              <View key={`${change.kind}-${change.exerciseId}`} style={styles.changeRow}>
                <Feather
                  name={change.kind === 'added' ? 'plus' : 'minus'}
                  size={14}
                  color={change.kind === 'added' ? colors.textSuccess : colors.textMuted}
                />
                <Text style={styles.changeName}>{change.name}</Text>
                <Text style={styles.changeKind}>
                  {change.kind === 'added' ? 'added' : 'removed'}
                </Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.toggleRow} onPress={onToggleSaveChanges}>
            <View style={[styles.checkbox, saveChangesToTemplate && styles.checkboxChecked]}>
              {saveChangesToTemplate && <Feather name="check" size={14} color={colors.onAccent} />}
            </View>
            <Text style={styles.toggleLabel}>
              Save these changes to {templateName}
            </Text>
          </Pressable>
          <Text style={styles.toggleHint}>
            {saveChangesToTemplate
              ? `${templateName} will start with this exercise list next time.`
              : `${templateName} stays as it is — these changes apply to today only.`}
          </Text>
        </View>
      )}
    </ConfirmModal>
  );
}

const styles = StyleSheet.create({
  summaryBlock: { gap: 10 },
  summaryText: { ...numeric.inline, fontSize: 17, color: colors.textPrimary },
  warningText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  changesBlock: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    gap: 14,
  },
  changesTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  changeList: { gap: 10 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  changeName: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  changeKind: { fontSize: 12, color: colors.textMuted },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleLabel: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  toggleHint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});
