import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderHandlers,
  type PanResponderGestureState,
  type PanResponderInstance,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors } from '../../constants/theme';
import { GESTURE_FEATURES } from '../../constants/features';

// What `renderItem` receives to build its drag affordance. Spread `panHandlers` onto
// the grip view; use `isDragging` for the lifted state.
export interface DragHandle {
  panHandlers: GestureResponderHandlers;
  isDragging: boolean;
}

// The list can't reach the enclosing ScrollView directly, and it needs to both read
// and drive it to auto-scroll while a card is held near an edge. The owning screen
// supplies this; every method is called imperatively from inside a gesture, never
// during render.
export interface DragScrollController {
  scrollTo(y: number): void;
  getOffset(): number;
  getContentHeight(): number;
  // Window coordinates, so it can be compared against a gesture's absolute moveY.
  getViewport(): { top: number; height: number };
}

interface Props<T> {
  items: T[]; // in display order
  keyExtractor: (item: T) => string;
  // `drag` is undefined when drag-to-reorder is switched off in constants/features.ts,
  // so the item can omit its grip affordance entirely rather than render a dead one.
  renderItem: (item: T, drag: DragHandle | undefined) => ReactNode;
  onReorder: (orderedKeys: string[]) => void;
  scroll: DragScrollController;
  // Vertical gap between cards. Applied as PADDING on the measured wrapper rather than
  // margin on the card, so a card's slot height is exactly what onLayout reports —
  // see the comment on SLOT measurement below.
  gap?: number;
  onDraggingChange?: (dragging: boolean) => void;
}

const AUTOSCROLL_EDGE = 96; // distance from a viewport edge that starts auto-scrolling
const AUTOSCROLL_STEP = 14; // px per tick
const AUTOSCROLL_INTERVAL = 16; // ms

// Drag-to-reorder for the active workout's exercise cards.
//
// **Built on React Native's own PanResponder and Animated, with no gesture library.**
// That is the central decision here and it was made on evidence: the previous attempt
// at this feature used react-native-gesture-handler + react-native-reanimated +
// react-native-draggable-flatlist and made the active workout screen fail to render
// outright, forcing a revert. The likely cause is that react-native-draggable-flatlist
// is unmaintained and depends on Reanimated 2/3 APIs (`useAnimatedGestureHandler`)
// that Reanimated 4 removed. PanResponder and Animated ship inside React Native, so
// there is no native module to mismatch, no babel plugin to configure, no Expo Go
// compatibility question, and nothing that can throw at import time. The worst
// realistic failure is a drag that feels imprecise — not a blank screen.
//
// The trade is that gesture events cross into JS rather than staying on the UI thread.
// Transforms still animate natively (`useNativeDriver: true` throughout), so the cost
// is limited to the per-move index arithmetic below, which is a few dozen additions.
// If the feel turns out to be unacceptable on a real phone, moving to RNGH's modern
// `Gesture` API plus Reanimated worklets is the upgrade path, and the geometry in this
// file carries over unchanged.
//
// ## How it works
//
// Dragging is initiated ONLY from the grip handle, never from the card body or a long
// press on it. This is what makes the gesture unambiguous: the handle claims the
// responder on touch-down (`onStartShouldSetPanResponder: () => true`), so a drag can
// never be confused with a scroll, and every other pixel of a very tall card still
// scrolls normally. A long-press-to-drag alternative would fight the ScrollView and
// would also collide with the set rows' own long-press (warm-up override).
//
// Nothing re-orders during the drag. The dragged card follows the finger and the other
// cards slide out of its way, all via transforms on top of an unchanged list order.
// Only on release is the new order committed. That keeps React's tree stable while a
// gesture is live — re-ordering mid-drag would remount cards, and ExerciseCard holds
// the weight/reps/RIR entry row in local state, which would be lost.
//
// ## Slot measurement
//
// Each card's "slot height" is its wrapper's `onLayout` height, which includes the
// inter-card gap because the gap is padding on the wrapper rather than margin on the
// card. Margin would sit OUTSIDE the measured box and every drop target would be off
// by one gap, accumulating with distance. Hence the `gap` prop instead of the card
// styling its own spacing.
export function DraggableExerciseList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  scroll,
  gap = 0,
  onDraggingChange,
}: Props<T>) {
  const heights = useRef(new Map<string, number>()).current;
  const translations = useRef(new Map<string, Animated.Value>()).current;
  const responders = useRef(new Map<string, PanResponderInstance>()).current;

  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Gesture-time state. All refs: these are read and written inside PanResponder
  // callbacks, which must not depend on a render having happened in between.
  const activeKeyRef = useRef<string | null>(null);
  const orderRef = useRef<string[]>([]); // key order captured at drag start
  const fromIndexRef = useRef(0);
  const toIndexRef = useRef(0);
  const dyRef = useRef(0);
  const autoScrollDeltaRef = useRef(0);
  const autoScrollDirRef = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const offsetRef = useRef(0);
  const viewportRef = useRef({ top: 0, height: 0 });

  // Callbacks are reached through a ref, never captured directly by the gesture.
  // A PanResponder is created once per card and cached for the life of the list
  // (re-creating one mid-gesture drops the gesture), so anything it closes over is
  // frozen at creation time — and `onReorder`/`onDraggingChange` arrive as inline
  // arrow functions from the owning screen's JSX, which are new on every render.
  // Capturing them directly would pin the list to the first render's copies.
  const callbacks = useRef({ onReorder, onDraggingChange });
  callbacks.current = { onReorder, onDraggingChange };

  const keys = items.map(keyExtractor);
  const orderSignature = keys.join('|');
  // Lets a gesture read the CURRENT list without the responder being re-created (and
  // the in-flight gesture dropped) every time `items` changes identity.
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const translationFor = useCallback(
    (key: string) => {
      let value = translations.get(key);
      if (!value) {
        value = new Animated.Value(0);
        translations.set(key, value);
      }
      return value;
    },
    [translations],
  );

  const slotHeight = useCallback((key: string) => heights.get(key) ?? 0, [heights]);

  // Once the DATA order matches what the transforms are already showing, the
  // transforms have done their job and reset to zero — which is a no-op visually.
  // Doing it this way is what prevents a flash of the pre-drag order: the on-screen
  // arrangement never reverts while the store's write is in flight, it just stops
  // being achieved by transforms and starts being the real order.
  useEffect(() => {
    for (const value of translations.values()) {
      value.stopAnimation();
      value.setValue(0);
    }
  }, [orderSignature, translations]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
    autoScrollDirRef.current = 0;
  }, []);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  // Which slot the dragged card currently covers. Compares the dragged card's centre
  // against each slot's extent in the PRE-DRAG layout, which is the coordinate space
  // `effectiveDy` is measured in.
  const computeTargetIndex = useCallback(
    (effectiveDy: number) => {
      const order = orderRef.current;
      const key = activeKeyRef.current;
      if (!key) return fromIndexRef.current;

      const tops: number[] = [];
      let acc = 0;
      for (const k of order) {
        tops.push(acc);
        acc += slotHeight(k);
      }

      const centre = tops[fromIndexRef.current] + effectiveDy + slotHeight(key) / 2;

      for (let i = 0; i < order.length; i++) {
        if (centre < tops[i] + slotHeight(order[i])) return i;
      }
      return order.length - 1;
    },
    [slotHeight],
  );

  // Opens a gap at `target` by sliding every card between the origin and the target
  // one slot toward the origin. Only the dragged card's own height matters, because
  // that is the size of the hole it left behind.
  const applyShifts = useCallback(
    (target: number) => {
      const order = orderRef.current;
      const key = activeKeyRef.current;
      if (!key) return;
      const from = fromIndexRef.current;
      const lifted = slotHeight(key);

      order.forEach((k, i) => {
        if (k === key) return;
        let shift = 0;
        if (target > from && i > from && i <= target) shift = -lifted;
        else if (target < from && i >= target && i < from) shift = lifted;

        Animated.spring(translationFor(k), {
          toValue: shift,
          useNativeDriver: true,
          overshootClamping: true,
          speed: 20,
          bounciness: 0,
        }).start();
      });
    },
    [slotHeight, translationFor],
  );

  // Where the dragged card must land to sit exactly in slot `target` — the summed
  // heights of the cards it passed over. Exact rather than approximate, so the card
  // settles flush into the gap instead of drifting toward it.
  const dropOffset = useCallback(
    (target: number) => {
      const order = orderRef.current;
      const from = fromIndexRef.current;
      if (target === from) return 0;
      let sum = 0;
      if (target > from) {
        for (let i = from + 1; i <= target; i++) sum += slotHeight(order[i]);
        return sum;
      }
      for (let i = target; i < from; i++) sum += slotHeight(order[i]);
      return -sum;
    },
    [slotHeight],
  );

  const updateActivePosition = useCallback(() => {
    const key = activeKeyRef.current;
    if (!key) return;

    // Auto-scrolling moves the content under a stationary finger, so the card's
    // translation has to absorb that movement too or it slides out from under the
    // thumb by exactly the scrolled distance.
    const effectiveDy = dyRef.current + autoScrollDeltaRef.current;
    translationFor(key).setValue(effectiveDy);

    const target = computeTargetIndex(effectiveDy);
    if (target !== toIndexRef.current) {
      toIndexRef.current = target;
      applyShifts(target);
      Haptics.selectionAsync().catch(() => {});
    }
  }, [applyShifts, computeTargetIndex, translationFor]);

  const updateAutoScroll = useCallback(
    (moveY: number) => {
      const { top, height } = viewportRef.current;
      if (height <= 0) return;

      const direction = moveY < top + AUTOSCROLL_EDGE ? -1 : moveY > top + height - AUTOSCROLL_EDGE ? 1 : 0;

      if (direction === 0) {
        stopAutoScroll();
        return;
      }

      autoScrollDirRef.current = direction;
      if (autoScrollTimer.current) return; // already ticking; direction updated above

      autoScrollTimer.current = setInterval(() => {
        // Tracked locally rather than re-read from the ScrollView: onScroll lags a
        // programmatic scrollTo, and reading a stale offset every 16ms would make the
        // scroll stutter or stall.
        const maxOffset = Math.max(0, scroll.getContentHeight() - viewportRef.current.height);
        const next = Math.min(
          maxOffset,
          Math.max(0, offsetRef.current + autoScrollDirRef.current * AUTOSCROLL_STEP),
        );
        const delta = next - offsetRef.current;
        if (delta === 0) return; // hit an end
        offsetRef.current = next;
        autoScrollDeltaRef.current += delta;
        scroll.scrollTo(next);
        updateActivePosition();
      }, AUTOSCROLL_INTERVAL);
    },
    [scroll, stopAutoScroll, updateActivePosition],
  );

  const beginDrag = useCallback(
    (key: string) => {
      const order = [...keysRef.current];
      const from = order.indexOf(key);
      if (from < 0) return;

      orderRef.current = order;
      fromIndexRef.current = from;
      toIndexRef.current = from;
      dyRef.current = 0;
      autoScrollDeltaRef.current = 0;
      activeKeyRef.current = key;
      offsetRef.current = scroll.getOffset();
      viewportRef.current = scroll.getViewport();

      for (const value of translations.values()) {
        value.stopAnimation();
        value.setValue(0);
      }

      setActiveKey(key);
      callbacks.current.onDraggingChange?.(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [scroll, translations],
  );

  const endDrag = useCallback(() => {
    stopAutoScroll();
    const key = activeKeyRef.current;
    activeKeyRef.current = null;
    setActiveKey(null);
    callbacks.current.onDraggingChange?.(false);
    if (!key) return;

    const from = fromIndexRef.current;
    const target = toIndexRef.current;

    // Settle into the gap. Deliberately NOT reset to zero: the transforms have to keep
    // holding the new arrangement until the committed order catches up (see the
    // orderSignature effect), or the list would visibly snap back to the pre-drag order
    // while the write is in flight.
    //
    // This spring is usually cut short — the store's write lands within a few
    // milliseconds and the orderSignature effect stops it and zeroes the transform, by
    // which point zero IS the card's correct position. So the drop reads as a snap
    // rather than a glide. That's the deliberate trade: committing the reorder
    // immediately keeps `orderRef` and what's on screen describing the same list at
    // every instant, which is what makes starting a second drag straight after a first
    // one safe. Deferring the commit to the spring's completion callback would animate
    // more prettily and leave a ~300ms window in which a new drag reads a stale order.
    Animated.spring(translationFor(key), {
      toValue: dropOffset(target),
      useNativeDriver: true,
      overshootClamping: true,
      speed: 20,
      bounciness: 0,
    }).start();

    if (target !== from) {
      const next = [...orderRef.current];
      next.splice(from, 1);
      next.splice(target, 0, key);
      callbacks.current.onReorder(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [dropOffset, stopAutoScroll, translationFor]);

  const responderFor = useCallback(
    (key: string) => {
      let responder = responders.get(key);
      if (responder) return responder;

      const handleMove = (gesture: PanResponderGestureState) => {
        dyRef.current = gesture.dy;
        updateActivePosition();
        updateAutoScroll(gesture.moveY);
      };

      responder = PanResponder.create({
        // True, unlike the swipe row's: the handle exists only to drag, so it claims
        // the gesture on touch-down. That is what guarantees the ScrollView never
        // wins, without needing a movement-direction test.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The enclosing ScrollView asks for the responder back as soon as it sees
        // vertical movement. Refusing is what keeps a drag alive.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => beginDrag(key),
        onPanResponderMove: (_evt, gesture) => handleMove(gesture),
        onPanResponderRelease: endDrag,
        onPanResponderTerminate: endDrag,
      });
      responders.set(key, responder);
      return responder;
    },
    [beginDrag, endDrag, responders, updateActivePosition, updateAutoScroll],
  );

  return (
    <View>
      {items.map((item) => {
        const key = keyExtractor(item);
        const isDragging = activeKey === key;
        // Undefined, not an inert handle, when the feature is off: the card keys its
        // grip affordance off this prop's presence, so an empty handler bag would draw
        // a grip icon that does nothing.
        const dragHandle: DragHandle | undefined = GESTURE_FEATURES.dragToReorderExercises
          ? { panHandlers: responderFor(key).panHandlers, isDragging }
          : undefined;

        return (
          <Animated.View
            key={key}
            // Height here IS the slot height used by every calculation above, gap
            // included — see the note on slot measurement.
            onLayout={(event) => heights.set(key, event.nativeEvent.layout.height)}
            style={[
              { paddingBottom: gap },
              isDragging && styles.lifted,
              { transform: [{ translateY: translationFor(key) }] },
            ]}
          >
            {renderItem(item, dragHandle)}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Raises the dragged card above its neighbours and shadows it, so it reads as picked
  // up rather than as the list having glitched.
  lifted: {
    zIndex: 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    // Android clips shadows to the parent unless the view has its own background.
    backgroundColor: colors.surface2,
  },
});
