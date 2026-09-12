import { useState } from 'react';
import { Pressable, Text, TextInput, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  formatValue?: (value: number) => string;
  textStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

// CLAUDE.md "Numeric input": tapping a weight/reps field used to leave the existing
// value in place, so typing appended instead of replacing ("0" + "5" -> "05"). Fixed
// by never pre-seeding the edit draft with the current value — entering edit mode
// always starts empty, so the first keystroke is always clean and a full retype
// always works, with no dependency on native select-on-focus behavior.
//
// A popup-based version of this was tried (to dodge the keyboard covering a row near
// the bottom of the active workout scroll) but every caller in that scroll now edits
// through EditSetModal — itself already a popup — so nesting a second popup inside it
// just meant tapping a number twice to do anything. Plain inline editing here;
// screens that need keyboard-avoidance handle it themselves (as EditSetModal does by
// being a modal), rather than this shared primitive assuming every caller needs it.
//
// onChange fires on every valid keystroke, not just on blur/submit. EditSetModal's
// Save button reads the parent's draft state directly the instant it's pressed — if
// this only committed on blur, tapping Save while the field was still focused raced
// the field's blur event against the button's press (on iOS, Pressable's onPress
// routinely wins that race), so a just-typed value could be silently dropped in favor
// of whatever was there before. Updating on every keystroke means the parent is
// already correct by the time any other control reads it — nothing to race.
export function NumericField({ value, onChange, min = 0, formatValue, textStyle, containerStyle }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function beginEditing() {
    setDraft('');
    setEditing(true);
  }

  function handleChangeText(text: string) {
    setDraft(text);
    const trimmed = text.trim();
    if (trimmed !== '') {
      const parsed = parseFloat(trimmed);
      if (!Number.isNaN(parsed)) onChange(Math.max(min, parsed));
    }
  }

  if (editing) {
    return (
      <TextInput
        style={[containerStyle, textStyle]}
        value={draft}
        onChangeText={handleChangeText}
        onBlur={() => setEditing(false)}
        onSubmitEditing={() => setEditing(false)}
        keyboardType="decimal-pad"
        autoFocus
      />
    );
  }

  return (
    <Pressable style={containerStyle} onPress={beginEditing} hitSlop={6}>
      <Text style={textStyle}>{formatValue ? formatValue(value) : value}</Text>
    </Pressable>
  );
}
