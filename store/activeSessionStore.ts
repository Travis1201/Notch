import { create } from 'zustand';

import type { Database } from '../db/client';
import type { SessionExerciseStatus, SessionStatus } from '../db/schema';
import { getSession, setCurrentSessionExercise, finishSession } from '../db/queries/sessions';
import {
  listSessionExercises,
  addExerciseToSession,
  skipSessionExercise,
  unskipSessionExercise,
  reorderSessionExercises,
  updateSessionExerciseVariant,
} from '../db/queries/sessionExercises';
import {
  findOrCreateEquipmentVariant,
  getEquipmentVariant,
  getLastUsedBrand,
} from '../db/queries/equipmentVariants';
import {
  listSetsForSession,
  logSet as logSetQuery,
  updateSet as updateSetQuery,
  getLastSessionTopSet,
} from '../db/queries/sets';
import type { Set as SetRow } from '../db/types';

export type { SetRow };

// Stable reference for "no sets logged for this variant yet." A selector that fell
// back to a freshly-constructed `[]` on every call broke Zustand's
// useSyncExternalStore (a new reference each render looks like a perpetual change)
// and crashed the app with "Maximum update depth exceeded" — see
// components/session/ActiveExercisePanel.tsx.
export const EMPTY_SETS: SetRow[] = [];

export interface SessionExerciseVM {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  status: SessionExerciseStatus;
  equipmentVariantId: string;
  brand: string | null;
}

interface ActiveSessionState {
  sessionId: string | null;
  gymId: string | null;
  date: Date | null;
  status: SessionStatus | null;
  currentSessionExerciseId: string | null;
  exercises: SessionExerciseVM[];
  setsByEquipmentVariantId: Record<string, SetRow[]>;
  lastTopSetByEquipmentVariantId: Record<string, SetRow | null>;
  isHydrated: boolean;

  loadSession(db: Database, sessionId: string): Promise<void>;
  addExercise(db: Database, exerciseId: string, exerciseName: string): Promise<void>;
  skipExercise(db: Database, sessionExerciseId: string): Promise<void>;
  unskipExercise(db: Database, sessionExerciseId: string): Promise<void>;
  reorderExercises(db: Database, orderedIds: string[]): Promise<void>;
  setCurrentExercise(db: Database, sessionExerciseId: string): Promise<void>;
  setExerciseBrand(
    db: Database,
    sessionExerciseId: string,
    exerciseId: string,
    brand: string | null,
  ): Promise<void>;
  ensureLastTopSet(
    db: Database,
    equipmentVariantId: string,
    repFloor: number,
  ): Promise<SetRow | null>;
  logSet(
    db: Database,
    input: { equipmentVariantId: string; weight: number; reps: number; rir: number },
  ): Promise<SetRow>;
  updateSet(
    db: Database,
    setId: string,
    equipmentVariantId: string,
    patch: Partial<{ weight: number; reps: number; rir: number; isWarmupOverride: boolean | null }>,
  ): Promise<void>;
  toggleWarmupOverride(db: Database, set: SetRow): Promise<void>;
  finish(db: Database): Promise<void>;
  reset(): void;
}

const initialState = {
  sessionId: null,
  gymId: null,
  date: null,
  status: null,
  currentSessionExerciseId: null,
  exercises: [],
  setsByEquipmentVariantId: {},
  lastTopSetByEquipmentVariantId: {},
  isHydrated: false,
} satisfies Partial<ActiveSessionState>;

export const useActiveSessionStore = create<ActiveSessionState>((set, get) => ({
  ...initialState,

  // ONE-SHOT hydration on screen mount — never rebuilt from DB on every render, per
  // CLAUDE.md's Gotchas section.
  async loadSession(db, sessionId) {
    const session = await getSession(db, sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const rows = await listSessionExercises(db, sessionId);
    const exercises: SessionExerciseVM[] = [];
    for (const row of rows) {
      // Normally already resolved and persisted when the exercise was added — just
      // read the variant to get its brand. Falls back to a fresh no-brand resolution
      // only for a session_exercise row created before equipmentVariantId existed on
      // this table (a pre-upgrade in-progress session) — never the case going forward.
      let variant = row.equipmentVariantId ? await getEquipmentVariant(db, row.equipmentVariantId) : null;
      if (!variant) {
        variant = await findOrCreateEquipmentVariant(db, {
          exerciseId: row.exerciseId,
          gymId: session.gymId,
          brand: null,
        });
      }
      exercises.push({
        id: row.id,
        exerciseId: row.exerciseId,
        name: row.exercise.name,
        position: row.position,
        status: row.status,
        equipmentVariantId: variant.id,
        brand: variant.brand,
      });
    }

    const allSets = await listSetsForSession(db, sessionId);
    const setsByEquipmentVariantId: Record<string, SetRow[]> = {};
    for (const s of allSets) {
      (setsByEquipmentVariantId[s.equipmentVariantId] ??= []).push(s);
    }

    set({
      sessionId: session.id,
      gymId: session.gymId,
      date: session.date,
      status: session.status,
      currentSessionExerciseId: session.currentSessionExerciseId,
      exercises,
      setsByEquipmentVariantId,
      lastTopSetByEquipmentVariantId: {},
      isHydrated: true,
    });
  },

  async addExercise(db, exerciseId, exerciseName) {
    const { sessionId, gymId } = get();
    if (!sessionId || !gymId) return;

    // CLAUDE.md "Core design principle: confirm, don't input" — "Equipment brand
    // defaults to whatever was used last time for this exercise at this gym."
    const rememberedBrand = await getLastUsedBrand(db, exerciseId, gymId);
    const variant = await findOrCreateEquipmentVariant(db, {
      exerciseId,
      gymId,
      brand: rememberedBrand,
    });
    const row = await addExerciseToSession(db, {
      sessionId,
      exerciseId,
      equipmentVariantId: variant.id,
    });
    const session = await getSession(db, sessionId);

    set((state) => ({
      exercises: [
        ...state.exercises,
        {
          id: row.id,
          exerciseId,
          name: exerciseName,
          position: row.position,
          status: row.status,
          equipmentVariantId: variant.id,
          brand: variant.brand,
        },
      ],
      currentSessionExerciseId: session?.currentSessionExerciseId ?? state.currentSessionExerciseId,
    }));
  },

  async skipExercise(db, sessionExerciseId) {
    const { sessionId } = get();
    if (!sessionId) return;
    await skipSessionExercise(db, sessionExerciseId);
    const session = await getSession(db, sessionId);
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === sessionExerciseId ? { ...e, status: 'skipped' } : e,
      ),
      currentSessionExerciseId: session?.currentSessionExerciseId ?? null,
    }));
  },

  async unskipExercise(db, sessionExerciseId) {
    await unskipSessionExercise(db, sessionExerciseId);
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === sessionExerciseId ? { ...e, status: 'pending' } : e,
      ),
    }));
  },

  async reorderExercises(db, orderedIds) {
    const { sessionId } = get();
    if (!sessionId) return;
    await reorderSessionExercises(db, sessionId, orderedIds);
    set((state) => {
      const byId = new Map(state.exercises.map((e) => [e.id, e]));
      const reordered = orderedIds
        .map((id, i) => {
          const e = byId.get(id);
          return e ? { ...e, position: i } : null;
        })
        .filter((e): e is SessionExerciseVM => e !== null);
      return { exercises: reordered };
    });
  },

  async setCurrentExercise(db, sessionExerciseId) {
    const { sessionId } = get();
    if (!sessionId) return;
    await setCurrentSessionExercise(db, sessionId, sessionExerciseId);
    set({ currentSessionExerciseId: sessionExerciseId });
  },

  // Mid-session brand change (the equipment row on the logging screen). Already-
  // logged sets stay put — this only repoints what gets logged from here on, and a
  // brand switch naturally starts a fresh warm-up/top-set history for the new
  // variant, which is correct: it's genuinely a different machine.
  async setExerciseBrand(db, sessionExerciseId, exerciseId, brand) {
    const { gymId } = get();
    if (!gymId) return;
    const variant = await findOrCreateEquipmentVariant(db, { exerciseId, gymId, brand });
    await updateSessionExerciseVariant(db, sessionExerciseId, variant.id);
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === sessionExerciseId ? { ...e, equipmentVariantId: variant.id, brand: variant.brand } : e,
      ),
    }));
  },

  async ensureLastTopSet(db, equipmentVariantId, repFloor) {
    const cached = get().lastTopSetByEquipmentVariantId[equipmentVariantId];
    if (cached !== undefined) return cached;
    const { sessionId } = get();
    if (!sessionId) return null;
    const topSet = await getLastSessionTopSet(db, equipmentVariantId, sessionId, repFloor);
    set((state) => ({
      lastTopSetByEquipmentVariantId: {
        ...state.lastTopSetByEquipmentVariantId,
        [equipmentVariantId]: topSet,
      },
    }));
    return topSet;
  },

  async logSet(db, input) {
    const { sessionId } = get();
    if (!sessionId) throw new Error('No active session');
    const row = await logSetQuery(db, { sessionId, ...input });
    set((state) => ({
      setsByEquipmentVariantId: {
        ...state.setsByEquipmentVariantId,
        [input.equipmentVariantId]: [
          ...(state.setsByEquipmentVariantId[input.equipmentVariantId] ?? []),
          row,
        ],
      },
    }));
    return row;
  },

  async updateSet(db, setId, equipmentVariantId, patch) {
    await updateSetQuery(db, setId, patch);
    set((state) => ({
      setsByEquipmentVariantId: {
        ...state.setsByEquipmentVariantId,
        [equipmentVariantId]: (state.setsByEquipmentVariantId[equipmentVariantId] ?? []).map((s) =>
          s.id === setId ? { ...s, ...patch } : s,
        ),
      },
    }));
  },

  async toggleWarmupOverride(db, setRow) {
    // Cycles null -> true -> false -> null isn't needed here; a simple tap toggles
    // between "not a warm-up" and "warm-up" starting from whatever's currently
    // displayed, since the inferred value is already visible on screen.
    const nextOverride = !setRow.isWarmupOverride;
    await get().updateSet(db, setRow.id, setRow.equipmentVariantId, {
      isWarmupOverride: nextOverride,
    });
  },

  async finish(db) {
    const { sessionId } = get();
    if (!sessionId) return;
    await finishSession(db, sessionId);
    get().reset();
  },

  reset() {
    set({ ...initialState });
  },
}));
