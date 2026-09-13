import { create } from 'zustand';

import type { Database } from '../db/client';
import type { SessionStatus } from '../db/schema';
import { getSession, finishSession, cancelSession } from '../db/queries/sessions';
import {
  listSessionExercises,
  addExerciseToSession,
  removeExerciseFromSession,
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
  deleteSet as deleteSetQuery,
  getLastSessionTopSet,
  getLastSessionWorkingSets,
} from '../db/queries/sets';
import type { PrefillSet } from '../lib/prefill';
import type { Set as SetRow } from '../db/types';

export type { SetRow };

// Stable reference for "no sets logged for this variant yet." A selector that fell
// back to a freshly-constructed `[]` on every call broke Zustand's
// useSyncExternalStore (a new reference each render looks like a perpetual change)
// and crashed the app with "Maximum update depth exceeded" — see
// components/session/ExerciseCard.tsx.
export const EMPTY_SETS: SetRow[] = [];

// CLAUDE.md "Active workout screen": no forced order, no "current exercise" pointer —
// every exercise's section is visible and independently loggable at any time. This VM
// no longer carries a skip/pending status: with nothing hidden and no order gating
// anything, "skipped" isn't a real state, just "zero sets logged so far," which is
// display-only (see setsByEquipmentVariantId).
export interface SessionExerciseVM {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  equipmentVariantId: string;
  brand: string | null;
}

interface ActiveSessionState {
  sessionId: string | null;
  gymId: string | null;
  date: Date | null;
  status: SessionStatus | null;
  templateId: string | null;
  exercises: SessionExerciseVM[];
  setsByEquipmentVariantId: Record<string, SetRow[]>;
  lastTopSetByEquipmentVariantId: Record<string, SetRow | null>;
  lastWorkingSetsByEquipmentVariantId: Record<string, SetRow[]>;
  isHydrated: boolean;

  loadSession(db: Database, sessionId: string): Promise<void>;
  addExercise(db: Database, exerciseId: string, exerciseName: string): Promise<void>;
  removeExercise(db: Database, sessionExerciseId: string): Promise<void>;
  reorderExercises(db: Database, orderedIds: string[]): Promise<void>;
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
  ensureLastWorkingSets(db: Database, equipmentVariantId: string): Promise<SetRow[]>;
  logSet(db: Database, equipmentVariantId: string, values: PrefillSet): Promise<void>;
  updateSet(
    db: Database,
    setId: string,
    equipmentVariantId: string,
    patch: Partial<{ weight: number; reps: number; rir: number; isWarmupOverride: boolean | null }>,
  ): Promise<void>;
  deleteLoggedSet(db: Database, equipmentVariantId: string, setId: string): Promise<void>;
  toggleWarmupOverride(db: Database, set: SetRow): Promise<void>;
  finish(db: Database): Promise<void>;
  cancel(db: Database): Promise<void>;
  reset(): void;
}

const initialState = {
  sessionId: null,
  gymId: null,
  date: null,
  status: null,
  templateId: null,
  exercises: [],
  setsByEquipmentVariantId: {},
  lastTopSetByEquipmentVariantId: {},
  lastWorkingSetsByEquipmentVariantId: {},
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
      templateId: session.templateId,
      exercises,
      setsByEquipmentVariantId,
      lastTopSetByEquipmentVariantId: {},
      lastWorkingSetsByEquipmentVariantId: {},
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

    set((state) => ({
      exercises: [
        ...state.exercises,
        {
          id: row.id,
          exerciseId,
          name: exerciseName,
          position: row.position,
          equipmentVariantId: variant.id,
          brand: variant.brand,
        },
      ],
    }));
  },

  // Drops an exercise out of the live session and forgets everything cached under it.
  // Every per-variant cache is keyed by equipmentVariantId and has to be cleared
  // together with the row: leaving the `sets` entry behind would resurrect the
  // just-deleted sets into the next render of that variant if the exercise is
  // re-added, and a stale lastTopSet/lastWorkingSets entry would keep feeding the
  // re-added card a Previous column and green arrow computed before the removal.
  //
  // Only clears a variant's cache when no OTHER exercise in the session still points
  // at it. Two session_exercise rows for the same exercise (e.g. the same movement
  // added twice mid-workout) share one variant, so removing one must not blank the
  // other's rows.
  async removeExercise(db, sessionExerciseId) {
    const { sessionId, exercises } = get();
    if (!sessionId) return;
    const target = exercises.find((e) => e.id === sessionExerciseId);
    if (!target) return;

    await removeExerciseFromSession(db, {
      sessionId,
      sessionExerciseId,
      exerciseId: target.exerciseId,
    });

    set((state) => {
      const remaining = state.exercises.filter((e) => e.id !== sessionExerciseId);
      const variantStillInUse = remaining.some(
        (e) => e.equipmentVariantId === target.equipmentVariantId,
      );
      if (variantStillInUse) return { exercises: remaining };

      const variantId = target.equipmentVariantId;
      const omit = <T,>(record: Record<string, T>): Record<string, T> => {
        const { [variantId]: _removed, ...rest } = record;
        return rest;
      };
      return {
        exercises: remaining,
        setsByEquipmentVariantId: omit(state.setsByEquipmentVariantId),
        lastTopSetByEquipmentVariantId: omit(state.lastTopSetByEquipmentVariantId),
        lastWorkingSetsByEquipmentVariantId: omit(state.lastWorkingSetsByEquipmentVariantId),
      };
    });
  },

  // No UI calls this right now. The up/down-arrow reorder sheet it was written for was
  // removed at the requester's direction pending a real drag-to-reorder gesture, and
  // this action is exactly the shape that work needs (a fully reordered list of
  // session_exercise ids), so it's retained rather than deleted and re-derived. See
  // ARCHITECTURE.md's limitations section.
  // The ONE optimistic action in this store: memory is updated first, synchronously,
  // and the database write follows. Everything else here is write-then-reflect (await
  // the write, then update state from its result), and that is still the right default
  // — but it is wrong for this one.
  //
  // A drag-and-drop has to land the instant the finger lifts. Awaiting the write first
  // left a window between the drop and the re-render in which the dropped card was
  // translated to its new position while the list still rendered it in its old slot and
  // it had lost the raised z-index it carried during the drag — so it sat hidden behind
  // an opaque neighbour, and only reappeared when some later interaction forced a
  // re-render. That is the "dragged card disappears until you tap something" bug.
  //
  // Safe to do optimistically here, and specifically NOT safe for the others: exercise
  // order is display-only. Nothing derives from it — not the top set, not the green
  // arrow, not pre-fill, not duration — so an order that is briefly ahead of the
  // database can't produce a wrong number anywhere. A failed write is rolled back so
  // the screen never keeps showing an order that wouldn't survive a reload.
  async reorderExercises(db, orderedIds) {
    const { sessionId, exercises: previous } = get();
    if (!sessionId) return;

    const byId = new Map(previous.map((e) => [e.id, e]));
    const reordered = orderedIds
      .map((id, i) => {
        const e = byId.get(id);
        return e ? { ...e, position: i } : null;
      })
      .filter((e): e is SessionExerciseVM => e !== null);

    set({ exercises: reordered });

    try {
      await reorderSessionExercises(db, sessionId, orderedIds);
    } catch (error) {
      // Only roll back if this session is still the one on screen and nothing else has
      // changed the list since — restoring a stale snapshot over a newer edit (an
      // exercise added or removed while the write was in flight) would be worse than
      // the order being briefly out of step with the database.
      const current = get();
      if (current.sessionId === sessionId && current.exercises === reordered) {
        set({ exercises: previous });
      }
      throw error;
    }
  },

  // Mid-session brand change (the settings-bolt row on an exercise card). Already-
  // logged sets stay put — this only repoints what gets logged from here on, and a
  // brand switch naturally starts fresh Previous/top-set/prefill data for the new
  // variant (its cache key), which is correct: it's genuinely a different machine.
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
    const { sessionId, date } = get();
    if (!sessionId || !date) return null;
    const topSet = await getLastSessionTopSet(db, equipmentVariantId, sessionId, repFloor, date);
    set((state) => ({
      lastTopSetByEquipmentVariantId: {
        ...state.lastTopSetByEquipmentVariantId,
        [equipmentVariantId]: topSet,
      },
    }));
    return topSet;
  },

  async ensureLastWorkingSets(db, equipmentVariantId) {
    const cached = get().lastWorkingSetsByEquipmentVariantId[equipmentVariantId];
    if (cached !== undefined) return cached;
    const { sessionId, date } = get();
    if (!sessionId || !date) return EMPTY_SETS;
    const workingSets = await getLastSessionWorkingSets(db, equipmentVariantId, sessionId, date);
    set((state) => ({
      lastWorkingSetsByEquipmentVariantId: {
        ...state.lastWorkingSetsByEquipmentVariantId,
        [equipmentVariantId]: workingSets,
      },
    }));
    return workingSets;
  },

  // Writes one set to SQLite immediately and appends it to in-memory state — the only
  // path by which a set gets logged. CLAUDE.md "In-progress sessions": "Each set
  // writes to the database as it is logged, never batched to the end," because iOS
  // terminates backgrounded apps and a phone call mid-workout must not wipe the
  // session.
  //
  // The card's entry row (weight/reps/RIR) lives in component state, not here: it's
  // ephemeral keystroke-level UI that re-seeds from lib/prefill on every logged set,
  // and nothing outside that one card ever reads it. An earlier version kept an array
  // of unconfirmed "draft" set rows in this store instead, one per predicted set, so
  // that logging was a checkmark per row; the mockup's single always-pre-filled entry
  // area does the same job in fewer taps (the next set's numbers are already there
  // the instant the previous one is logged) without a second, parallel notion of "a
  // set that exists but isn't real yet" to keep consistent with the database.
  //
  // Explicit fields, never `...values`: a spread here previously let a pre-filled
  // object's own (stale, prior-session) `sessionId` overwrite the real one, filing
  // every logged set under the wrong workout. Listing the fields makes that
  // impossible to reintroduce even if a fat object reaches this function — and
  // logSetQuery's NoExtraKeys guard now rejects one at compile time too.
  async logSet(db, equipmentVariantId, values) {
    const { sessionId } = get();
    if (!sessionId) return;
    const row = await logSetQuery(db, {
      sessionId,
      equipmentVariantId,
      weight: values.weight,
      reps: values.reps,
      rir: values.rir,
    });
    set((state) => ({
      setsByEquipmentVariantId: {
        ...state.setsByEquipmentVariantId,
        [equipmentVariantId]: [...(state.setsByEquipmentVariantId[equipmentVariantId] ?? []), row],
      },
    }));
  },

  // CLAUDE.md "Active workout screen": "Every logged set remains editable for the
  // life of the session... logged is never the same as locked." Used both for
  // correcting a confirmed set's weight/reps/RIR and for the warm-up override toggle
  // — an edit rewrites the stored row in place, it never un-logs it.
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

  // "If I accidentally added a 4th set I want to be able to delete it" — a logged set
  // is editable for the life of the session (see updateSet above), and that includes
  // removing it outright.
  async deleteLoggedSet(db, equipmentVariantId, setId) {
    await deleteSetQuery(db, setId);
    set((state) => ({
      setsByEquipmentVariantId: {
        ...state.setsByEquipmentVariantId,
        [equipmentVariantId]: (state.setsByEquipmentVariantId[equipmentVariantId] ?? []).filter(
          (s) => s.id !== setId,
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

  // Throws the whole session away rather than finalising it — see
  // db/queries/sessions.ts cancelSession for why finishing an untrained session isn't
  // an equivalent exit. Resets unconditionally, even if cancelSession declined
  // (session already complete or gone): either way this screen has nothing left to
  // show, and holding onto a dead session's state would let the caller navigate back
  // into it.
  async cancel(db) {
    const { sessionId } = get();
    if (!sessionId) return;
    await cancelSession(db, sessionId);
    get().reset();
  },

  reset() {
    set({ ...initialState });
  },
}));
