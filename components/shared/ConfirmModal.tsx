import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';

// Clear space below the lowest button, on top of the device's bottom safe-area inset.
const FOOTER_BOTTOM_GAP = 28;

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  confirmTone?: 'accent' | 'destructive';
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode; // extra body content between the message and the buttons
}

// A real confirmation screen rather than a native Alert, for the two actions that end
// a workout. Finish and Cancel both need more than an Alert can carry: Finish shows a
// session summary and, when the exercise list changed, an itemised list of those
// changes plus a toggle; Cancel names what is about to be destroyed. Alert's two or
// three unstyled buttons and single message string can't express either, and the
// three-dot overflow menu they were previously reached through hid a destructive
// action behind a glyph with no label.
//
// Both actions confirm. Finish previously committed the instant it was tapped, which
// on a screen used one-handed at arm's length meant a mis-tap permanently ended the
// workout — there is no un-finish, since finalising writes a duration and makes the
// session a completed record that later sessions get compared against.
//
// The confirm button sits BELOW the body, at the bottom of the sheet, so reaching it
// requires having scrolled past whatever the sheet is asking about.
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmTone = 'accent',
  cancelLabel,
  onConfirm,
  onClose,
  children,
}: Props) {
  // The footer sits above the home indicator, plus a deliberate gap beyond it. With
  // only the safe-area inset the secondary action read as falling off the bottom edge
  // of the sheet — and it's the action a user reaches for to back OUT of ending their
  // workout, so it needs to look reachable rather than clipped.
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.headerClose}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + FOOTER_BOTTOM_GAP }]}>
          <Pressable
            style={[
              styles.confirmButton,
              confirmTone === 'destructive' && styles.confirmButtonDestructive,
            ]}
            onPress={onConfirm}
          >
            <Text
              style={[
                styles.confirmLabel,
                confirmTone === 'destructive' && styles.confirmLabelDestructive,
              ]}
            >
              {confirmLabel}
            </Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelLabel}>{cancelLabel}</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  headerClose: { fontSize: 15, color: colors.accent },
  body: { padding: 16, gap: 16 },
  message: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  footer: {
    padding: 16,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  confirmButton: {
    height: 50,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDestructive: { backgroundColor: colors.danger },
  // This button is accent or danger depending on the action, so its ink tracks
  // the fill rather than assuming both take the same one.
  confirmLabel: { fontSize: 16, fontWeight: '500', color: colors.onAccent },
  confirmLabelDestructive: { color: colors.onDanger },
  cancelButton: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 15, color: colors.textSecondary },
});
