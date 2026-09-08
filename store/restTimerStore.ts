import { create } from 'zustand';

interface RestTimerState {
  isRunning: boolean;
  durationSeconds: number;
  // Absolute epoch ms, not a decrementing counter. Display components recompute
  // `remaining = max(0, endsAt - Date.now())` on their own interval purely for
  // re-rendering — this is what keeps the countdown immune to JS-timer throttling
  // while backgrounded, since the source of truth never accumulates drift.
  endsAt: number | null;
  exerciseId: string | null;

  start(durationSeconds: number, exerciseId: string): void;
  skip(): void;
  addSeconds(delta: number): void;
  clear(): void;
}

export const useRestTimerStore = create<RestTimerState>((set, get) => ({
  isRunning: false,
  durationSeconds: 0,
  endsAt: null,
  exerciseId: null,

  start(durationSeconds, exerciseId) {
    set({
      isRunning: true,
      durationSeconds,
      endsAt: Date.now() + durationSeconds * 1000,
      exerciseId,
    });
  },

  skip() {
    set({ isRunning: false, endsAt: null, exerciseId: null });
  },

  addSeconds(delta) {
    const { endsAt } = get();
    if (endsAt === null) return;
    const nextEndsAt = Math.max(Date.now(), endsAt + delta * 1000);
    set({ endsAt: nextEndsAt, durationSeconds: get().durationSeconds + delta });
  },

  clear() {
    set({ isRunning: false, endsAt: null, exerciseId: null, durationSeconds: 0 });
  },
}));
