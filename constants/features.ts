// Runtime kill switches for the two gesture-driven interactions on the active workout
// screen. Flip one to `false`, save, and Metro's fast refresh drops that feature back
// to the behaviour that preceded it — no rebuild, no git.
//
// These exist because gestures are the one part of this app with a history of taking
// the whole screen down. An earlier drag-to-reorder built on
// react-native-gesture-handler + react-native-reanimated +
// react-native-draggable-flatlist made the active workout screen fail to render
// outright, and had to be reverted. The current implementations deliberately use only
// React Native's built-in `PanResponder` and `Animated` (see the components), so there
// is no native module to mismatch and no import that can fail at load — but "no
// dependency to break" is not the same as "verified on a phone", and neither of these
// has run on real hardware yet.
//
// If a gesture misbehaves, the fallback is intended to be fully usable, not degraded:
// with drag off there is no reorder UI at all (as before), and with swipe off a set is
// still deleted from inside EditSetModal, which remains the path either way.
export const GESTURE_FEATURES = {
  // Drag an exercise card by the grip handle in its header to reorder the session.
  dragToReorderExercises: true,
  // Swipe a logged set row left to reveal a Delete action.
  swipeToDeleteSets: true,
} as const;
