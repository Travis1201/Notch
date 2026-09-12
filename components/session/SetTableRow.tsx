import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors } from '../../constants/theme';
import { GESTURE_FEATURES } from '../../constants/features';

interface Props {
  index: number; // 1-based, display only
  weight: number; // lb
  reps: number;
  rir: number;
  isWarmup: boolean;
  isCurrentTopSet: boolean;
  improved: boolean;
  formatWeight: (lb: number) => number;
  onOpenEdit: () => void;
  onToggleWarmup: () => void;
  // Swipe-to-delete. Open state is owned by the parent so only one row in an exercise
  // can be open at a time — two rows hanging open at once reads as a rendering bug.
  onDelete: () => void;
  isSwipeOpen: boolean;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
}

// Width of the revealed Delete action, and how far the row must be dragged before
// releasing latches it open rather than springing back.
const ACTION_WIDTH = 88;
const OPEN_THRESHOLD = 36;
// A little travel past the action's width, so a hard swipe has somewhere to go instead
// of hitting a wall — it reads as elastic rather than broken.
const MAX_TRAVEL = ACTION_WIDTH + 28;

// One already-logged set, styled to notch-ui-mockups.png's set list: a muted index
// cell, "230 × 7" as the row's body, and RIR (or the word "warm-up") trailing. A
// working set sits on a surface3 pill; an inferred warm-up is greyed with no fill,
// which is exactly CLAUDE.md's "render greyed out" requirement.
//
// There is no Previous column. The mockup carries last session's numbers ONCE per
// exercise, in the accent-tinted "Last time · Aug 31" block above this list, rather
// than repeating a per-row reference.
//
// Three gestures, chosen so they can't be confused for one another:
//   tap        → open EditSetModal (CLAUDE.md: "logged is never the same as locked")
//   long press → toggle the warm-up-inference override ("Tap to override")
//   swipe left → reveal Delete
//
// The swipe runs on React Native's built-in PanResponder and Animated, NOT on
// react-native-gesture-handler. That's deliberate: a previous swipe-to-delete built on
// RNGH's `Swipeable` caused this entire screen to fail to render (Reanimated 4
// incompatibility) and had to be reverted. PanResponder ships with React Native, so
// there is no native module to mismatch and nothing that can fail at import time —
// the worst case is a gesture that feels wrong rather than a blank screen.
//
// The responder only claims the gesture once movement is clearly HORIZONTAL (see
// onMoveShouldSetPanResponder). Without that test the row would steal every vertical
// drag from the ScrollView and the workout would become unscrollable.
export function SetTableRow({
  index,
  weight,
  reps,
  rir,
  isWarmup,
  isCurrentTopSet,
  improved,
  formatWeight,
  onOpenEdit,
  onToggleWarmup,
  onDelete,
  isSwipeOpen,
  onSwipeOpen,
  onSwipeClose,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  // The row's resting position: 0 (closed) or -ACTION_WIDTH (open). A drag is measured
  // from here, so swiping an already-open row further doesn't jump back to zero first.
  const restingOffset = useRef(0);

  // Props are read through a ref inside the PanResponder. The responder is created
  // once (an empty dep list) because re-creating it mid-gesture drops the gesture;
  // without the ref it would close over the first render's callbacks forever.
  const handlers = useRef({ onSwipeOpen, onSwipeClose });
  handlers.current = { onSwipeOpen, onSwipeClose };

  const settle = useCallback(
    (open: boolean) => {
      restingOffset.current = open ? -ACTION_WIDTH : 0;
      Animated.spring(translateX, {
        toValue: restingOffset.current,
        useNativeDriver: true,
        overshootClamping: true,
        speed: 20,
        bounciness: 0,
      }).start();
    },
    [translateX],
  );

  // Follows the parent's open state, which is what closes this row when a sibling is
  // opened. Also covers the release path below: settling locally keeps the animation
  // immediate, and this reconciles if the parent disagrees.
  useEffect(() => {
    settle(isSwipeOpen);
  }, [isSwipeOpen, settle]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // False, so a plain tap reaches the row's Pressable instead of being swallowed.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
        // Once a horizontal swipe has been claimed, keep it. This defaults to TRUE,
        // which let the enclosing ScrollView take the gesture back the moment the
        // finger drifted vertically mid-swipe — the row would stall partway open and
        // the list would start scrolling instead.
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_evt, gesture) => {
          // Left-only: a right swipe on a closed row does nothing, and on an open row
          // it closes. Clamped so the row can't be dragged off its own card.
          const next = Math.min(0, Math.max(-MAX_TRAVEL, restingOffset.current + gesture.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_evt, gesture) => {
          const open = restingOffset.current + gesture.dx < -OPEN_THRESHOLD;
          settle(open);
          if (open) handlers.current.onSwipeOpen();
          else handlers.current.onSwipeClose();
        },
        // A gesture taken away mid-swipe (the ScrollView winning, a modal opening)
        // must not leave the row parked half-open.
        onPanResponderTerminate: () => {
          settle(false);
          handlers.current.onSwipeClose();
        },
      }),
    [settle, translateX],
  );

  function handleRowPress() {
    // An open row's first tap closes it. Opening the editor from here instead would
    // make the Delete action impossible to dismiss without hitting it.
    if (isSwipeOpen) {
      onSwipeClose();
      return;
    }
    onOpenEdit();
  }

  function handleDeletePress() {
    // No confirmation dialog: swiping and then tapping Delete is already two
    // deliberate actions, and the same set is still deletable (with a confirmation)
    // from inside EditSetModal for anyone who gets here by tapping instead.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSwipeClose();
    onDelete();
  }

  const row = (
    <Pressable
      style={[styles.row, !isWarmup && styles.rowWorking]}
      onPress={handleRowPress}
      onLongPress={onToggleWarmup}
      delayLongPress={350}
      hitSlop={4}
    >
      <Text style={[styles.index, isWarmup && styles.mutedText]}>{index}</Text>

      <Text style={[styles.value, isWarmup && styles.mutedValue]}>
        {formatWeight(weight)} × {reps}
      </Text>

      {isWarmup ? (
        <Text style={styles.warmupLabel}>warm-up</Text>
      ) : (
        <Text style={styles.rirLabel}>{rir >= 4 ? '4+' : rir} RIR</Text>
      )}

      {/* Green arrow on the session's own top set when it beat last session's — the
          one place on this row where colour carries meaning. A flat session shows
          nothing at all, never a red arrow or a "0" (CLAUDE.md "The green
          up-arrow"), so the spacer keeps rows aligned without implying a verdict. */}
      {isCurrentTopSet && improved ? (
        <Feather name="arrow-up-right" size={14} color={colors.textSuccess} />
      ) : (
        <View style={styles.arrowSpacer} />
      )}
    </Pressable>
  );

  if (!GESTURE_FEATURES.swipeToDeleteSets) return row;

  return (
    <View style={styles.swipeContainer}>
      {/* Sits behind the row and is revealed by it sliding left. `overflow: hidden` on
          the container is what keeps the red inside the row's rounded corners. */}
      <View style={styles.actionLayer} pointerEvents={isSwipeOpen ? 'auto' : 'none'}>
        <Pressable style={styles.deleteAction} onPress={handleDeletePress}>
          <Feather name="trash-2" size={17} color="#fff" />
          <Text style={styles.deleteActionLabel}>Delete</Text>
        </Pressable>
      </View>

      {/* Opaque, so the action layer can't show through a warm-up row's transparent
          fill. surface1 is the card's own background, so this is visually identical
          to the ungestured row. */}
      <Animated.View
        style={[styles.rowSlider, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        {row}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: { borderRadius: 8, overflow: 'hidden' },
  actionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
  },
  deleteAction: {
    width: ACTION_WIDTH,
    height: '100%',
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteActionLabel: { fontSize: 11, fontWeight: '500', color: '#fff' },
  rowSlider: { backgroundColor: colors.surface1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rowWorking: { backgroundColor: colors.surface3 },
  index: { fontSize: 12, color: colors.textSecondary, width: 14 },
  value: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  mutedValue: { color: colors.textMuted, fontWeight: '400' },
  mutedText: { color: colors.textMuted },
  warmupLabel: { fontSize: 11, color: colors.textMuted },
  rirLabel: { fontSize: 12, color: colors.textSecondary },
  arrowSpacer: { width: 14 },
});
