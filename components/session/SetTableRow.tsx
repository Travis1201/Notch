import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, numeric, radii } from '../../constants/theme';
import { GESTURE_FEATURES } from '../../constants/features';

interface Props {
  index: number; // 1-based, display only
  weight: number; // lb
  reps: number;
  rir: number;
  isWarmup: boolean;
  isCurrentTopSet: boolean;
  improved: boolean;
  // CLAUDE.md "Live PR feedback" stage 2: the "+5 lb" / "+2 reps" magnitude beside the
  // arrow. Passed ONLY by the active workout screen — History and Progress leave it
  // undefined, which is stage 3 ("reverts on finish") falling out for free rather than
  // needing a status check in here. Never stored; derived on every render.
  improvementLabel?: string | null;
  // UI-changes.md: the PR moment is the app's ONE animated beat, and it lands on the
  // number itself. The active workout passes its latest PR celebration to the top-set
  // row; History and Progress never pass it. `at` is a timestamp rather than a counter
  // so a row that mounts BECAUSE of the PR (the common case — a freshly logged set)
  // still plays it, while a row that merely remounts later doesn't replay a stale one.
  prCelebration?: { at: number } | null;
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

// The PR pulse: the weight × reps swell and flash green, then settle — well under a
// second in total (CLAUDE.md "Live PR feedback": "a pulse, not a persistent state").
// Scale and a flat colour crossfade only; no glow, no gradient.
const PR_PULSE_IN_MS = 150;
const PR_PULSE_HOLD_MS = 220;
const PR_PULSE_OUT_MS = 320;
const PR_PULSE_SCALE = 1.22;
// A celebration older than this is history, not news; a row mounting now skips it.
const PR_PULSE_FRESH_MS = 800;

// One already-logged set, styled to notch-ui-mockups.png's set list: a muted index
// cell, "230 × 7" as the row's body, and RIR (or the word "warm-up") trailing. The
// weight and reps are the loudest thing on the row, in fixed-width tabular columns so
// a stack of sets lines up digit for digit; the "×" and "RIR" are quiet. A working set
// sits on a surfaceRaised pill; an inferred warm-up is greyed with no fill,
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
  improvementLabel,
  prCelebration,
  formatWeight,
  onOpenEdit,
  onToggleWarmup,
  onDelete,
  isSwipeOpen,
  onSwipeOpen,
  onSwipeClose,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const prPulse = useRef(new Animated.Value(0)).current;
  const lastCelebratedAt = useRef(0);

  useEffect(() => {
    if (!prCelebration || prCelebration.at <= lastCelebratedAt.current) return;
    lastCelebratedAt.current = prCelebration.at;
    if (Date.now() - prCelebration.at > PR_PULSE_FRESH_MS) return;
    prPulse.stopAnimation();
    prPulse.setValue(0);
    Animated.sequence([
      Animated.timing(prPulse, {
        toValue: 1,
        duration: PR_PULSE_IN_MS,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
      Animated.delay(PR_PULSE_HOLD_MS),
      Animated.timing(prPulse, {
        toValue: 0,
        duration: PR_PULSE_OUT_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [prCelebration, prPulse]);
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

      {/* The green copy sits exactly over the white one and only its opacity animates,
          so the colour flash stays on the native driver (colour interpolation can't).
          Scaled from the left edge so the swell doesn't push into the index cell. */}
      <Animated.View
        style={[
          styles.valueGroup,
          { transform: [{ scale: prPulse.interpolate({ inputRange: [0, 1], outputRange: [1, PR_PULSE_SCALE] }) }] },
        ]}
      >
        <SetValue weight={formatWeight(weight)} reps={reps} muted={isWarmup} />
        {prCelebration ? (
          <Animated.View pointerEvents="none" style={[styles.valueOverlay, { opacity: prPulse }]}>
            <SetValue weight={formatWeight(weight)} reps={reps} muted={false} success />
          </Animated.View>
        ) : null}
      </Animated.View>

      <View style={styles.spacer} />

      {isWarmup ? (
        <Text style={styles.warmupLabel}>warm-up</Text>
      ) : (
        <View style={styles.rirGroup}>
          <Text style={styles.rirValue}>{rir >= 4 ? '4+' : rir}</Text>
          <Text style={styles.rirLabel}>RIR</Text>
        </View>
      )}

      {/* Green arrow on the session's own top set when it beat last session's — the
          one place on this row where colour carries meaning. A flat session shows
          nothing at all, never a red arrow or a "0" (CLAUDE.md "The green
          up-arrow"), so the spacer keeps rows aligned without implying a verdict. */}
      {isCurrentTopSet && improved ? (
        <>
          {improvementLabel ? (
            <Text style={styles.improvementLabel} numberOfLines={1}>
              {improvementLabel}
            </Text>
          ) : null}
          <Feather name="arrow-up-right" size={14} color={colors.textSuccess} />
        </>
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
          <Feather name="trash-2" size={17} color={colors.onDanger} />
          <Text style={styles.deleteActionLabel}>Delete</Text>
        </Pressable>
      </View>

      {/* Opaque, so the action layer can't show through a warm-up row's transparent
          fill. `surface` is the card's own background, so this is visually identical
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

function SetValue({
  weight,
  reps,
  muted,
  success = false,
}: {
  weight: number;
  reps: number;
  muted: boolean;
  success?: boolean;
}) {
  const numberStyle = [styles.number, muted && styles.mutedNumber, success && styles.successText];
  return (
    <View style={styles.valueRow}>
      <Text style={[numberStyle, styles.weightCell]} numberOfLines={1}>
        {weight}
      </Text>
      <Text style={[styles.times, success && styles.successText]}>×</Text>
      <Text style={[numberStyle, styles.repsCell]} numberOfLines={1}>
        {reps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: { borderRadius: radii.row, overflow: 'hidden' },
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
  deleteActionLabel: { fontSize: 11, fontWeight: '500', color: colors.onDanger },
  rowSlider: { backgroundColor: colors.surface },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.row,
  },
  rowWorking: { backgroundColor: colors.surfaceRaised },
  index: { ...numeric.small, color: colors.textMuted, width: 16 },
  valueGroup: { transformOrigin: 'left center' },
  valueOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  number: { ...numeric.set, color: colors.textPrimary },
  mutedNumber: { color: colors.textMuted, fontWeight: '400' },
  successText: { color: colors.textSuccess },
  // Fixed widths so every row's "×" lands in the same place: weight right-aligned
  // (wide enough for "1102.5"), reps left-aligned.
  weightCell: { width: 64, textAlign: 'right' },
  times: { fontSize: 13, color: colors.textMuted, marginHorizontal: 6 },
  repsCell: { width: 28 },
  spacer: { flex: 1 },
  mutedText: { color: colors.textMuted },
  warmupLabel: { fontSize: 11, color: colors.textMuted },
  rirGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  rirValue: { ...numeric.inline, color: colors.textSecondary },
  rirLabel: { fontSize: 10, color: colors.textMuted },
  improvementLabel: { ...numeric.small, fontWeight: '600', color: colors.textSuccess },
  arrowSpacer: { width: 14 },
});
