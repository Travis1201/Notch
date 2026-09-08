# Architecture

How Notch actually works, for someone who wants to understand the system without
reading every file. Updated as the build proceeds — see the bottom section for what's
built versus what's still ahead per CLAUDE.md's build order.

---

## Stack

Expo (managed workflow) + TypeScript strict mode + `expo-router` (file-based
navigation) + `expo-sqlite` + Drizzle ORM, entirely on-device — no backend, no
accounts, no network calls. See CLAUDE.md for why (App Privacy labels, and it's a
deliberate product constraint, not a v1 shortcut).

## Data model

Defined in `db/schema.ts`, SQLite via Drizzle. Every table's primary key is a
dependency-free UUID v4 (`db/uuid.ts`) rather than an autoincrement int — deliberately,
so IDs stay stable and globally unique if cloud backup is ever added later, per
CLAUDE.md's "sync-friendly" schema note. `schema.ts` must never import any Expo/React
Native runtime module (see Migrations, below, for why).

**`gyms`** — id, name, isDefault. One row (`isDefault = true`) is created automatically
on first launch (see Bootstrap). Single-gym users never really interact with gym UI
beyond the header pill reading as a label; a second gym only exists once someone
deliberately adds one via the gym switcher. `isDefault` only ever marks the original
bootstrap-created row — it does NOT mean "the gym a new session should use." That's
`getLastUsedGym` (`db/queries/gyms.ts`): derived from the most recent session's `gymId`,
falling back to the default gym only when no session has ever been logged, per CLAUDE.md
"gym defaults to the last one used" — deliberately not a separately stored preference.

**`exercises`** — id, name, muscleGroup, equipmentType, isCustom, plus three nullable
per-exercise overrides (`restSeconds`, `weightIncrement`, `repFloor`) that fall back to
the single `settings` row when unset.

**`equipmentVariants`** — id, exerciseId, gymId, brand (nullable). This, not
`exercises`, is the unit progression is actually tracked against. The whole point of
the app is that a Hammer Strength chest press and a Technogym chest press are different
progression lines even though they're "the same exercise" — so every set logs against
an `equipmentVariantId`, never directly against an `exerciseId`. Variants are created
implicitly the first time a user logs that (exercise, gym, brand) combination, via a
find-or-create inside a transaction (`db/queries/equipmentVariants.ts`) — necessary
because the existing index on `(exerciseId, gymId)` isn't unique, and a unique index
wouldn't help anyway, since SQLite never treats two `NULL` brands as equal.

Brand is picked via a combobox (`components/exercises/EquipmentBrandPicker.tsx`) that
filters a seed list of majors (`constants/equipmentBrands.ts`) or accepts free text.
CLAUDE.md's "remembers per exercise+gym" is `getLastUsedBrand` — a gym can have swapped
equipment over time, so more than one variant can exist for the same (exercise, gym)
pair; it returns whichever one's most recently logged set is newest, not just the first
one found. This runs once, when an exercise is added to a session (defaulting the brand
silently, no prompt, per "confirm don't input") — never mid-set.

**`templates`** / **`templateExercises`** — structure only (an ordered exercise list),
never weights/reps/RIR. Not yet wired into any screen (build order step 5); the active
workout logging screen produces template-less sessions (`templateId = null`, an "empty
workout") until then.

**`sessions`** — id, date, gymId, templateId (nullable), status
(`in_progress`/`complete`), `currentSessionExerciseId` (nullable FK, see below),
durationSeconds (nullable until finalized).

**`sessionExercises`** — id, sessionId, exerciseId, position, status
(`pending`/`skipped`), createdAt. Added in migration `0001` after the original
`sessions.currentPosition` (a bare int) turned out unable to represent "which exercise
is current" once exercises can be reordered and skipped — an index into a list means
something different before and after a reorder. `sessions.currentSessionExerciseId` is
a durable FK into this table instead. It's also the only place "skipped" versus "not
yet reached" can live: both are zero-set states that mean different things, and `sets`
has no `exerciseId` column at all, so it can't represent an exercise with no sets
logged yet. There's deliberately no "added mid-workout" flag here — CLAUDE.md's
derive-don't-cache pattern (already used for PR flags, pre-fill, chart points) applies
just as well once templates exist: diff a session's final `sessionExercises` against
`templateExercises` at finish time instead of tracking it as separate state.

**`sets`** — id, sessionId, equipmentVariantId, weight (lb, always), reps, rir,
position, loggedAt, isWarmupOverride (nullable — null means "use inference"),
addedWeight/assistanceWeight (nullable, present from v1 though unused until the v2
bodyweight/assisted-movement feature, since retrofitting them later would be painful).
`position` is a **session-global** monotonic counter assigned at log time — not reset
per exercise — which sidesteps needing an `exerciseId` column just to order a
single-exercise subset (filter to one `equipmentVariantId`, the ordering still holds).

**`settings`** — single row (id fixed at 1): unit preference, default rest seconds,
default weight increment, default rep floor. The migration only defines *defaults for
future inserts*; nothing actually inserts the row until Bootstrap does.

**`goals`** — id, equipmentVariantId, targetWeight, targetReps, createdAt, achievedAt.
Not used yet (v2).

## Migrations

Generated with `npx drizzle-kit generate` from `db/schema.ts`, reviewed by hand, and
bundled for the app via `babel-plugin-inline-import` (`.sql` files import as raw
strings — see `babel.config.js` and `metro.config.js`'s `sourceExts.push('sql')`) plus
an auto-generated `db/migrations/migrations.js` barrel that drizzle-kit regenerates on
every `generate` run. `db/DatabaseProvider.tsx` runs them via
`drizzle-orm/expo-sqlite/migrator`'s `migrate()` once, on app boot, before rendering
any screen.

Two non-obvious things worth knowing if you touch the schema again:

- `drizzle-kit generate` opens an interactive rename-detection prompt whenever a single
  diff both drops and adds a column on the same table (it's asking "did you mean to
  rename X to Y?"), and that prompt requires a TTY this dev environment doesn't have.
  Migrations `0001` and `0002` are split for exactly this reason — `0001` only adds
  (the `sessionExercises` table and the new nullable
  `currentSessionExerciseId` column), `0002` only drops the old `currentPosition`
  column — so neither diff is ambiguous enough to trigger the prompt. If a future
  schema change needs to both drop and add columns on one table, expect to split it the
  same way.
- `schema.ts` must never import an Expo/React Native runtime module. `expo-crypto` was
  tried for UUID generation during initial scaffolding and broke `drizzle-kit generate`
  outright, because its esbuild-based loader can't parse React Native's Flow-typed
  source when it loads `schema.ts` for static analysis. `db/uuid.ts` is a small,
  dependency-free UUID v4 implementation specifically so this file stays import-clean.

## Local persistence layer

`db/client.ts` opens the database with `openDatabaseAsync` (never the legacy sync API)
and memoizes the connection for the app's lifetime. `db/DatabaseProvider.tsx` wraps the
whole app, runs migrations, then runs **bootstrap** (`db/bootstrap.ts` —
`ensureSettingsRow` + `ensureDefaultGym`, both idempotent) before exposing the ready
database via `useDatabase()`; every screen can assume a gym and a settings row already
exist by the time it renders. Everything in between is a loading state; failure is a
plain error screen.

## Pure-logic layer

`lib/progression.ts`, `lib/warmups.ts`, and `lib/prefill.ts` hold the rules that must
stay identical everywhere they're used, per CLAUDE.md's repeated instruction to put
each in exactly one named function:

- `selectTopSet` (progression.ts) — the heaviest set for an exercise/session, ties
  broken by more reps, filtered by a rep floor (defaulting to 1, which reproduces v1
  behavior exactly). Runs on the *raw* set list, not a warm-up-filtered one — a warm-up
  is definitionally lighter than the top set, so it can never win the comparison, and
  no separate filter step is needed to keep warm-ups out of progression math.
- `didImprove` (progression.ts) — the green-arrow rule: true iff both a current and
  previous top set exist and the current one wins the same comparison `selectTopSet`
  uses. A session with no prior top set (or that doesn't beat it) shows nothing, never
  a red arrow or a "0" — CLAUDE.md is explicit that flat sessions must not read as
  failure.
- `classifyWarmups` (warmups.ts) — a set is a warm-up iff it was logged before the top
  set (by session-global `position`, not per-exercise) and is lighter than it, unless
  `isWarmupOverride` says otherwise. **Back-off-set decision**: a set logged *after*
  the top set defaults to NOT a warm-up regardless of weight, since it reads as a real
  working set in gym terminology; this has zero effect on progression math either way
  (`selectTopSet` never looks at `isWarmup`), and the override tap is available on
  every set row for a user who wants a lighter back-off set dimmed anyway.
- `resolveFirstSetPrefill` / `resolveNextSetPrefill` (prefill.ts) — deliberately
  simpler than replaying last session's entire set sequence positionally: the first
  set of an exercise this session anchors to last session's top set (weight, reps,
  *and* RIR); every set after that just carries forward the set logged immediately
  before it this session. Matches "the stepper always adjusts a pre-filled value"
  (Weight increments) more directly than a full replay would.

`lib/exerciseDefaults.ts` centralizes the "per-exercise override falls back to the
settings default" pattern, used identically for rest seconds, weight increment, and
rep floor. `lib/units.ts` converts lb↔kg only at the UI boundary — every stored weight
stays in lb.

## State management

The in-progress session lives in a Zustand store (`store/activeSessionStore.ts`, no
`persist` middleware — SQLite is the only durable source of truth, exactly because iOS
can and does kill backgrounded apps, and a second persistence layer would create a
competing one for data CLAUDE.md requires to be written per-set, not batched). It
hydrates once from SQLite on screen mount (`loadSession`) and never rebuilds itself
from the database on every render. Every mutation is **write-then-reflect**, not
optimistic: each action `await`s its SQLite write first, then updates in-memory state
from the result — local SQLite writes are single-digit milliseconds, so there's no
perceptible lag, and it sidesteps an entire class of rollback bugs an optimistic-update
model would introduce. Derived values (top set, "improved," warm-up classification) are
never stored in the Zustand state either — they're computed at render time from
`setsByEquipmentVariantId` via the pure-logic layer above, keeping "derive, don't
cache" true in memory as well as in SQLite.

**Zustand selector gotcha, hit once already:** a selector must never fall back to a
freshly-constructed `[]`/`{}` (e.g. `s.setsByEquipmentVariantId[id] ?? []`). Zustand's
hook is built on `useSyncExternalStore`, which calls the selector every render to
check whether the snapshot changed — a new array reference each call looks like a
perpetual change and crashes the app with "Maximum update depth exceeded." Fix is a
stable module-level constant (`activeSessionStore.ts` exports `EMPTY_SETS` for this).
Grep for `?? []`/`?? {}` inside any `useActiveSessionStore`/`useRestTimerStore` call
before adding a new selector.

A second store, `store/restTimerStore.ts`, tracks the rest timer as an absolute
`endsAt` epoch timestamp rather than a decrementing counter — display components
recompute `remaining = max(0, endsAt - Date.now())` on their own interval purely to
re-render, which is what keeps the countdown immune to JS-timer throttling while the
app is backgrounded, since the source of truth never accumulates drift.
`hooks/useRestTimerNotifications.ts` (mounted once at the session screen root) watches
that store and schedules/cancels a local notification and fires a haptic on natural
completion — CLAUDE.md "Rest timer": auto-starts the moment a set is logged, works
phone-locked, skippable/adjustable without leaving the screen.

## Screen structure

`app/` is expo-router file-based routing. `app/_layout.tsx` wraps the whole app in
`DatabaseProvider`. `app/(tabs)/` holds the four-tab shell (Home / Progress / Exercises
/ History) — Progress and History are still bare placeholders; Home has minimal
functional Start/Resume-workout wiring (not the final hero-card design from Visual
design, which depends on templates existing in step 5) plus a `__DEV__`-only seed-data
button (`db/dev/seedTestData.ts` — dead-code-eliminated from release builds).

**Exercises tab** (`app/(tabs)/exercises.tsx`) lists every exercise — grouped by
muscle group via `SectionList` with no search query, collapsing to a flat search-result
`FlatList` once one is typed — with a "Custom" pill on user-created rows and a "+ New"
entry point. Tapping a row pushes `app/exercise/[id].tsx`, a real screen (not a modal,
matching `app/session/[id].tsx`'s precedent): core fields (name/muscle group/equipment
type) are editable only for custom exercises, rendered as plain read-only text for the
seeded ones — CLAUDE.md's seed list is deliberately generic content, and the stated
escape hatch for wanting something different is creating a custom exercise, not
mutating the shared seeded taxonomy other progression logic scopes against. The three
per-exercise overrides (rest seconds, weight increment, rep floor) are editable
regardless of `isCustom` — that's exactly "per-exercise override for anything unusual,"
CLAUDE.md's own words, with no seeded/custom carve-out — each shown via
`components/exercises/ExerciseOverrideRow.tsx` with its effective value, a
default/custom caption, and a reset-to-`null` link. `components/exercises/
ExerciseForm.tsx` (relocated and generalized from what was originally a
session-only `CreateExerciseForm`) is shared by exercise creation here, the logging
screen's add-exercise sheet, and this detail screen's edit mode — one form, three
callers, driven by an optional `initialValues` prop and a `submitLabel` override
rather than three near-duplicate components.

**Exercise seed list**: `db/seedExercises.ts` holds 60 generic-named exercises
(barbell/dumbbell/machine/cable/bodyweight), inserted once via `ensureSeedExercises`
in `db/bootstrap.ts` (same idempotent check-then-insert pattern as the default gym and
settings row, sentinel is "does any `isCustom = false` row exist") — this runs for
every real install, unlike the `__DEV__`-only fake-history fixture, which now looks up
"Chest press"/"Back squat" from the real seed list instead of inserting its own
(their names would otherwise collide).

The active workout screen lives at `app/session/[id].tsx`, structured as a
**single-focused-exercise view** — one exercise's full logging UI on screen at a time,
with a "N of M" position indicator and a "Next" row to advance — per
`notch-ui-mockups.html`'s reference layout, rather than a scrollable stack of every
exercise's card at once. Skip, reorder, jump-to-exercise, and add-exercise are
consolidated into one sheet (`components/session/ExercisesSheet.tsx`) reachable from
the header, since the mockup's minimal per-exercise chrome has no room for inline
controls on every card. `components/session/ActiveExercisePanel.tsx` is the current
exercise's full view (last-time reference, logged-sets list via `SetRow`, entry
controls via `NumberStepper`/`RirSelector`); it resolves the exercise's per-exercise
overrides and pre-fill on mount/exercise-change, and otherwise reads/writes only
through the store above.

The screen only ever produces template-less "empty workout" sessions
(`templateId = null`), since templates don't exist until step 5. `session_exercises`
rows never get a `status` beyond `pending`/`skipped` — there's no "done" status; "am I
on this exercise" is entirely determined by `sessions.currentSessionExerciseId`.
Each row also carries `equipmentVariantId`: resolved once — to whatever brand was last
used for that exercise at that gym, or none — when the exercise is added, and persisted
so a reload doesn't need to re-resolve it (an earlier version silently re-resolved to
"no brand" on every reload; this is why the column exists rather than deriving it).
Changing brand mid-session (`ActiveExercisePanel`'s equipment row → `EquipmentBrandPicker`
→ `activeSessionStore.setExerciseBrand`) just repoints this pointer to a different
variant — already-logged sets keep referencing the variant they were actually logged
against, and the newly-pointed variant naturally starts its own fresh warm-up/top-set
history, which is correct: it's genuinely a different machine.

**Gym switcher**: a pill in Home's header (`components/gyms/GymSwitcherModal.tsx`),
defaulting to `getLastUsedGym` — single-gym users effectively never see it do anything,
matching CLAUDE.md's "single-gym users read it as a label." Picking a different gym
only changes local Home-screen state (which gym the *next* new session will use); it's
not a separately persisted "current gym" concept, consistent with "gym defaults to the
last one used" being derived, not stored.

## Known limitations / not yet built

Per CLAUDE.md's build order: templates (and their pre-fill wiring), progression
charts, and history browsing are all not built yet. Exercise deletion is deliberately
absent — CLAUDE.md never calls for it, and deleting an exercise with existing
sets/variants raises history-integrity questions out of scope for now. Gym
renaming/deletion is similarly absent — CLAUDE.md doesn't call for it, and the same
integrity questions apply. Cross-gym reference display (a travel session showing
greyed-out home-gym numbers, per CLAUDE.md's Multi-gym section) isn't built — first
sessions at a new gym currently show no pre-fill at all, which is honest but not yet
the specified UX. `victory-native` / `react-native-gifted-charts` (named in CLAUDE.md's
Stack section for progression charts) isn't installed, since nothing needs it until
step 7. Auto-close (CLAUDE.md: 3 hours of inactivity) is swept on Home's
focus effect rather than a background `AppState` listener — correct for the case that
matters (Home always reflects accurate resumable-session state before the user acts on
it) but a session backgrounded for 3+ hours won't flip to `complete` until the user
next visits Home, not the instant the threshold passes. The kg unit-conversion path in
`lib/units.ts` is implemented but functionally unverified, since no Settings screen
exists yet to actually switch `unitPreference` away from its `lb` default.
