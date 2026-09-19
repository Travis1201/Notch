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
never weights/reps/RIR. Starting a workout from one copies that structure into fresh
`sessionExercises` rows; no number is ever copied, because there is no stored number to
copy. Everything the logging screen shows is read live from history, which is why
CLAUDE.md forbids an "update template weights" prompt — Tuesday's PR is automatically
what Thursday pre-fills, with nothing to go stale. An ad-hoc session has
`templateId = null` ("empty workout") and so has no structure to diff against at
finish.

**`sessions`** — id, date, gymId, templateId (nullable), status
(`in_progress`/`complete`), `currentSessionExerciseId` (nullable FK, see below),
durationSeconds (nullable until finalized).

**`sessionExercises`** — id, sessionId, exerciseId, position, createdAt,
equipmentVariantId. This is what makes an exercise exist in a session independently of
whether anything has been logged for it: `sets` has no `exerciseId` column at all, so
an exercise with zero sets has nowhere else to live. Rows are created from a template
at Start, or one at a time by "+ Add exercise" mid-workout, and removed by
`removeExerciseFromSession` (see State management).

There's deliberately no "added mid-workout" flag — CLAUDE.md's derive-don't-cache
pattern applies here too: the finish-time template prompt diffs the session's final
`sessionExercises` against `templateExercises` rather than tracking adds and removes as
separate state.

**Two vestigial columns** survive from the abandoned single-exercise-stepper design and
are no longer read by anything: `sessionExercises.status` (`pending`/`skipped`, always
`pending`) and `sessions.currentSessionExerciseId` (always null). With every exercise
visible and independently loggable, "skipped" stopped being a state — doing the last
exercise first is identical to doing the first one first — and there is no "current
exercise" to point at. They're left in place rather than dropped because a column-drop
migration buys nothing at this size and `drizzle-kit generate`'s rename prompt makes
drops the awkward kind of migration to author here (see Migrations). Treat them as
dead; don't start writing to them again.

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
`ensureSettingsRow` + `ensureDefaultGym` + `ensureSeedExercises`, all idempotent)
before exposing the ready database via `useDatabase()`; every screen can assume a gym,
a settings row, and the exercise library already exist by the time it renders.
Everything in between is a loading state; failure is a plain error screen.

`ensureSeedExercises` is idempotent **by exercise name**, not by a one-time "have we
ever seeded?" sentinel. The original version bailed out as soon as any
`isCustom = false` row existed, which meant an install created before a seed-list
change was permanently stuck on the old list — the only way to pick up new movements
was the dev "Reset app data" button, i.e. wiping all training history. Diffing on name
(case-insensitively, so a hand-created "preacher curl" doesn't end up duplicated) makes
growing the list reach existing installs on their next launch. It only ever *inserts*:
a user may have edited a seeded exercise's muscle group or overrides, and re-running on
every boot must not revert their edits. The insert is chunked inside one transaction,
since the list is now large enough for a single multi-row `INSERT` to approach SQLite's
`SQLITE_MAX_VARIABLE_NUMBER` — a limit only a fresh install would hit, i.e. every new
user and nobody testing an upgrade.

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
  uses. Sharing `compareSets` is the point: "beat" and "top set" can't disagree, so a
  heavier top set for fewer reps counts as an improvement (weight dominates) while more
  reps at a lighter weight does not. A session with no prior top set (or that doesn't
  beat it) shows nothing, never a red arrow or a "0" — CLAUDE.md is explicit that flat
  sessions must not read as failure.
- `describeImprovement` / `formatPrDelta` (progression.ts) — the *magnitude* behind that
  arrow, for live PR feedback (below). Gated on `didImprove` and returning null whenever
  it is false, so a row can never show a delta without an arrow or an arrow without a
  delta. Which dimension it reports follows the same precedence as the comparison:
  weight if weight moved, reps only if weight held steady — reporting "-1 rep" on a
  heavier top set would contradict the arrow on its own row. Amounts stay in lb;
  `formatPrDelta` takes the conversion as a callback so the file stays unit-agnostic.
- `classifyWarmups` (warmups.ts) — a set is a warm-up iff it was logged before the top
  set (by session-global `position`, not per-exercise) and is lighter than it, unless
  `isWarmupOverride` says otherwise. **Back-off-set decision**: a set logged *after*
  the top set defaults to NOT a warm-up regardless of weight, since it reads as a real
  working set in gym terminology; this has zero effect on progression math either way
  (`selectTopSet` never looks at `isWarmup`), and the override tap is available on
  every set row for a user who wants a lighter back-off set dimmed anyway.
- `resolvePrefillForRow` (prefill.ts) — position-based, not "always the top set":
  row N pre-fills from last session's Nth *working* set (warm-ups already excluded by
  `getLastSessionWorkingSets`), falling back to the most recent set logged this session
  once last session's list runs out, and to zeros only when there's no history at all.
  An earlier version anchored every row to last session's top set, which made a session
  that dropped weight after its top set pre-fill the top-set number onto every
  subsequent row and left the user doing the drop-off arithmetic by hand.
- `toPrefillSet` (prefill.ts) — narrows to exactly `{weight, reps, rir}` and never
  returns the source object. This is load-bearing, not tidiness: a `sets` row is
  structurally assignable to `PrefillSet`, so TypeScript happily let a full row through
  as a pre-fill value, and its stale `sessionId` then rode along into `logSet`'s input
  and filed every confirmed set under the *previous* session. `logSet`'s `NoExtraKeys`
  guard (`db/queries/sets.ts`) now rejects a wider object at compile time as a second
  line of defence.

`lib/sessionDuration.ts` holds the duration rule — last set timestamp minus first set
timestamp, never wall-clock close time, per CLAUDE.md — shared by `finishSession` (which
stores it) and the Finish confirmation sheet (which previews it), so the number shown
and the number written can't drift apart. The History list formats through it too.

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
from the database on every render. Almost every mutation is **write-then-reflect**, not
optimistic: each action `await`s its SQLite write first, then updates in-memory state
from the result — local SQLite writes are single-digit milliseconds, so there's no
perceptible lag, and it sidesteps an entire class of rollback bugs an optimistic-update
model would introduce.

`reorderExercises` is the **one exception**, and the reasoning is worth keeping because
it's the test any future exception has to pass. A drag-and-drop has to land on the frame
the finger lifts; awaiting the write first left a window in which the dropped card was
offset to its new position while the list still rendered it in its old slot, so it was
drawn underneath an opaque neighbour and only reappeared when a later interaction forced
a re-render. It is safe to invert here specifically because exercise order is
display-only — nothing derives from it (not the top set, not the green arrow, not
pre-fill, not duration), so an order briefly ahead of the database cannot produce a wrong
number anywhere. A failed write rolls the in-memory order back, and only if nothing else
has changed the list in the meantime. Derived values (top set, "improved," warm-up classification) are
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

**Session lifecycle actions.** `finish` finalises the session (computing and storing
`durationSeconds` as last-set minus first-set timestamp — never wall-clock close time)
and resets the store. `cancel` is the opposite exit and deletes the session outright,
sets and `sessionExercises` included, via `cancelSession`. The two are not
interchangeable: finishing a workout you didn't actually train writes a permanent,
near-empty session into History *and* into every downstream comparison that reads it —
a zero-set session becomes the "previous session" the next real one is measured
against — so cancel is the only correct way to back out of a mis-tapped Start.
`cancelSession` refuses to touch a `complete` session; deleting one of those is
History editing's own confirmed action (`deleteSession`).

`removeExercise` drops one exercise from a live session along with the sets logged
against it *in that session only*. It matches on every `equipmentVariant` of the
exercise rather than the row's current `equipmentVariantId`, because a mid-session brand
change repoints the `sessionExercise` at a new variant while leaving already-logged sets
on the old one — matching only the current pointer would orphan those sets: invisible in
the UI but still counted by charts and duration. It also clears every per-variant cache
entry (`sets`, `lastTopSet`, `lastWorkingSets`) for that variant, but only when no other
exercise in the session still points at it, so re-adding the exercise starts genuinely
fresh instead of resurrecting deleted rows. `app/history/[id].tsx` exposes the same
operation for a completed session, which is the counterpart to History editing's "add an
exercise to a past session" — and, per CLAUDE.md, does *not* prompt about templates.

**No draft-set state.** The store holds logged sets and nothing else. An earlier version
kept an array of unconfirmed "draft" sets per variant, one per predicted set, so logging
was a checkmark per row; the current screen has a single always-pre-filled entry row per
exercise card whose weight/reps/RIR live in component state. That's fewer taps (the next
set's numbers are already in the steppers the instant the previous one is logged) and
removes a second, parallel notion of "a set that exists but isn't real yet" that had to
be kept consistent with the database — the bug class that produced the stale-`sessionId`
failure described under Pure-logic above.

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
`DatabaseProvider` and pins a single dark theme (not system-adaptive). `app/(tabs)/`
holds the four-tab shell — Home / Progress / Exercises / History — styled to
`notch-ui-mockups.html`'s tab bar (19px glyphs, 10px labels, a 0.5px hairline over
the page background, with the device's bottom inset added to the mockup's padding rather than
replacing it). Three of the four icons come from Feather; Progress uses
MaterialCommunityIcons' `chart-line`, since Feather's nearest glyph is an arrow rather
than a plotted line. Both families ship inside `@expo/vector-icons`.

`constants/theme.ts` is the single source for colour, transcribed from the mockup's CSS
custom properties. Nothing hardcodes a hex value outside it except `#fff` on accent
fills, where white is the contrast requirement rather than a palette choice.

The palette is locked, so hierarchy comes from three other things `theme.ts` defines
(see `UI-changes.md` for the brief):

- **A tonal depth ladder** — `bg` (every screen, sheet, header, the tab bar) →
  `surface` (cards and grouped blocks) → `surfaceRaised` (active, focused or selected:
  a working set row, a selected pill, a field, a row under a finger). Value steps only,
  no new hues. Screens and cards previously sat two shades apart, which read as one
  flat plane.
- **A numeric type scale** (`numeric.*`) — weight, reps and RIR are heavier and larger
  than the text around them, always with tabular figures, and set rows put weight and
  reps in fixed-width columns so a stack of sets aligns digit for digit. The quieter
  `text.*` scale (small uppercase labels, card titles, meta lines) is what surrounds
  them.
- **Radii by role** (`radii.*`) — rows 8, buttons 10, cards 16, pills fully round — so
  a card, a button and a row inside a card don't read as the same kind of object.

Pressed list rows step up to `surfaceRaised` instantly. Nothing else animates on
purpose except the PR pulse (below); page-sheet slides and drag/swipe springs are
system presentation or direct manipulation, not decoration.

### Home (`app/(tabs)/index.tsx`)

Templates are the entire screen, per CLAUDE.md — no dashboard, no summary stats, no
recent-session list. A "Monday / Last lifted 2 days ago" header with the gym pill, then
one accent hero card, then hairline-divided plain rows.

The hero is whichever template is longest-since-performed (`sortByMostOverdue`,
never-performed sorting first as the most overdue of all), showing its first three
exercises with last session's top set beside each. This is ordering by recency, not
recommending a program. It has two other states: an in-progress session turns it into
"Resume workout", and no templates at all turns it into "Create your first template"
with the same prominence — CLAUDE.md's "Empty states" requires guidance without ever
seeding fake content.

Remaining templates are rows carrying a per-template colour dot
(`lib/templateColor.ts`), the green improvement count from the last session
(`getSessionImprovementCount`), and a relative date. A count of zero renders nothing at
all — no red arrow, no "0" — because users train near failure by design and flat
sessions must not read as failure.

Auto-close (3 hours of inactivity, measured from the last logged set) is swept from
this screen's focus effect.

### Active workout (`app/session/[id].tsx`)

**One scrollable screen showing every exercise in the session at once**, each as its own
card. This supersedes an earlier single-exercise stepper — one exercise on screen, "3 of
6", a forced Next arrow — that was built, used at the gym, and rejected: it locked the
user into one exercise and made already-logged sets uneditable. `notch-ui-mockups.png`'s
middle panel still *shows* that stepper, and the mockup file's own header note defers to
CLAUDE.md on component behaviour, so the mockup is followed for visual language and
CLAUDE.md for structure. Concretely: the mockup's accent-tinted "Last time" block,
numbered set rows with greyed warm-ups, bordered Weight/Reps steppers, the 0/1/2/3/4+
RIR pill row, and the full-width "Log set" button all appear verbatim — they just repeat
per card down one scroll instead of belonging to one focused exercise.

Because every card is always live, the one styling difference between cards is derived
from something real: the card holding the session's **most recently logged set** is the
one being worked. It gets a `borderStrong` hairline and keeps a solid accent "Log set";
every other card's button steps back to the accent tint. Before anything is logged no
card is singled out and every button is solid. This is display-only — computed from the
sets on every render (`cardFocus` in `ExerciseCard`), never stored, never a gate. The
hairline is always present (transparent when idle) so a focus change never alters a
card's measured height, which the drag-to-reorder slots depend on.

A persistent header leads with the **elapsed-time clock, centred and large** — the one
number glanced at from arm's length between sets, so it outranks the screen title for
that space. Above it sit the back chevron, the template name at subtitle weight, and
"X of Y" for a template-backed session: a display-only count of how many exercises have
at least one set logged, explicitly *not* the old stepper counter (nothing is gated on
it, there's no forced order, and an ad-hoc session shows none). Below it, **Cancel and
Finish sit side by side** as equally visible, equally labelled buttons. Cancel used to
live behind a three-dot overflow menu, which hid a destructive action behind an
unlabelled glyph and made the only exit from a mis-tapped Start something the user had
to go hunting for.

`components/session/ExerciseCard.tsx` is one exercise's section: title with a remove
control, the brand row (→ `EquipmentBrandPicker` → `setExerciseBrand`), the "Last time ·
Aug 31 / 225 × 7 @ 1 RIR" block, the logged-set list, and the entry controls. Entry is a
single always-pre-filled row resolved per row index from last session's working sets, so
"Log set" is one tap when the pre-filled numbers are already right and a stepper tap or
two when they aren't. There is no "+ Add set" control because there's nothing for it to
do — the entry row *is* the next set.

`components/session/SetTableRow.tsx` renders a logged set with no inline controls, as in
the mockup, and carries three gestures chosen so they can't be mistaken for each other:
**tap** opens `EditSetModal`, **long press** toggles the warm-up-inference override, and
**swipe left** reveals a Delete action. Editing goes through a modal rather than in place
because an inline editor put the keyboard over the field whenever the card sat near the
bottom of a long scroll. Delete exists in both places on purpose: the swipe is the fast
path, the modal's button is the discoverable one, and the modal's confirms while the
swipe doesn't — swiping and then tapping Delete is already two deliberate actions.

Open state for the swipe is owned by the parent (`ExerciseCard`, or the history detail
screen) rather than the row, so only one row can be open at a time; two rows hanging
open at once reads as a rendering bug. It also closes whenever the exercise's set count
changes, so a revealed Delete can never end up pointing at a row that has since moved.

### Gestures, and why they use no gesture library

Both the set swipe and the exercise drag are built on React Native's built-in
`PanResponder` and `Animated`. This is the third attempt at these two features; the
previous one used `react-native-gesture-handler` + `react-native-reanimated` +
`react-native-draggable-flatlist` and made the active workout screen fail to render
outright, forcing a revert. The likely cause is that `react-native-draggable-flatlist`
is unmaintained and depends on Reanimated 2/3 APIs (`useAnimatedGestureHandler`) that
Reanimated 4 removed.

`PanResponder` and `Animated` ship inside React Native: no native module to mismatch,
no babel plugin, no Expo Go compatibility question, and nothing that can throw at import
time. The worst realistic failure mode is a gesture that feels imprecise rather than a
blank screen — which matters more than smoothness here, because none of this can be
verified without a phone. The cost is that gesture events cross into JS instead of
staying on the UI thread; transforms still animate natively (`useNativeDriver: true`
everywhere, consistently — mixing drivers on one value is itself a crash), so the JS work
per move is a few dozen additions. RNGH's modern `Gesture` API plus Reanimated worklets
is the upgrade path if the feel isn't good enough, and the geometry carries over.

`constants/features.ts` holds a runtime kill switch for each of the two gestures. Flip
one to `false` and fast refresh drops that feature back to the behaviour that preceded
it — no rebuild, no git. Both fallbacks are fully usable rather than degraded: with drag
off there is no reorder UI, and with swipe off a set is still deleted from
`EditSetModal`.

### Drag-to-reorder (`components/session/DraggableExerciseList.tsx`)

A drag starts **only from the grip handle** in a card's header, never from the card body
or a long press on it. That is what makes the gesture unambiguous: the handle claims the
responder on touch-down, so a drag can never be confused with a scroll, and every other
pixel of a very tall card still scrolls normally. A long-press-to-drag would fight the
ScrollView and would also collide with the set rows' own long press.

Nothing reorders during the drag. The dragged card follows the finger and its neighbours
slide out of the way, all via transforms on top of an unchanged list order; only on
release is the new order committed. Keeping React's tree stable during a gesture matters
concretely — reordering mid-drag would move card instances around, and `ExerciseCard`
holds the weight/reps/RIR entry row in local state.

Each card's drop-slot height is its wrapper's `onLayout` height. The inter-card gap is
therefore **padding on that wrapper**, not margin on the card (which is why
`ExerciseCard` no longer sets `marginBottom` and the list takes a `gap` prop): margin
sits outside the measured box, so every drop target would be off by one gap, compounding
with distance. Drop offsets are summed from real measured heights rather than assuming a
uniform row height, because these cards genuinely differ in height by hundreds of pixels
depending on how many sets are logged.

Auto-scroll runs while a card is held near a viewport edge, which the screen makes
possible by handing the list a `DragScrollController` (read the offset and content
height, read the viewport in window coordinates, drive `scrollTo`). Cards are tall
enough that a long session spans several screens, so without it a card could not be
moved more than a couple of positions. The scrolled distance is added to the card's
translation, or the card would slide out from under a stationary thumb by exactly the
amount scrolled.

On release the new order is committed and **every transform is zeroed in the same
tick**. `reorderExercises` applies to memory synchronously (see State management), so the
next render already draws each card in its dropped position needing no offset — there is
never a frame in which a card is drawn at its new index while still carrying its old
one. An earlier version instead animated the card into the gap and held the transform
until the reordered data arrived; because the reorder awaited a database write, that gap
lasted long enough that the dropped card — offset from its slot and no longer raised —
was drawn *behind* the neighbour it had landed on, and stayed invisible until some later
interaction forced a re-render.

The cost is that a successful drop snaps rather than glides. That's the right trade: it
keeps what's on screen and what the data says in agreement at every instant, which is
also what makes starting a second drag immediately safe. A card dropped back where it
started has nothing to commit, so it does glide home — and keeps its raised z-index until
the spring finishes, since a card still offset from its slot without it would slide back
underneath its neighbours on the way.

### Live PR feedback

CLAUDE.md gives the plain green arrow two registers: quiet and direction-only when
*browsing* (history, charts, home-screen counts), and something louder at the *moment* a
PR happens. The louder version exists only while a session is `in_progress`, in three
stages, driven from `ExerciseCard` and rendered by the top set's `SetTableRow`.

**Stage 1, the pulse** — the app's one deliberate animation. The top set's weight × reps
swell (to 1.22×, with a slight overshoot) and flash green, then settle, all in well under
a second, plus a success haptic. It lands on the *number*, not the card, because the
number is what the moment is about. The green is a second copy of the text laid exactly
over the first with only its *opacity* animated — colour interpolation can't run on the
native driver, and every animation in this app stays native-driven (mixing drivers on
one value is itself a crash). Green because CLAUDE.md reserves it for progression
indicators, which is exactly what this is.

`ExerciseCard` decides *when* (below) and hands the top-set row a `{ at }` timestamp;
the row plays it. A timestamp rather than a counter because the PR row is usually one
that has only just mounted — the set that was just logged — so the row plays any
celebration it hasn't seen that is under 800ms old, and ignores a stale one if it
remounts later. A light-impact haptic fires on
*every* logged set, which is what makes the PR haptic read as something different; the
success one is delayed ~130ms so the two aren't felt as a single buzz.

**Stage 2, the persistent delta.** The top set's row keeps its arrow and gains a
magnitude — "+5 lb", "+2 reps" — for the rest of the session. Both of CLAUDE.md's
correctness notes fall out of deriving it on every render rather than storing it: it's
attached to whichever set *currently* holds top-set status, so it moves on its own when
a later set overtakes an earlier one, and editing a logged set recomputes it. Nothing is
keyed to a set id.

**Stage 3, reverting on finish**, needs no code at all. The delta is a prop only the
active workout screen passes; History and Progress leave it undefined and render the
plain arrow, so "live only" is structural rather than a `status` check that could be
forgotten in one of the three places the arrow appears.

The pulse is the one piece that *can't* be derived — a pulse is an event, not a state —
so it's triggered explicitly, by comparing the session's top set before and after a log
or an edit. That comparison is what keeps it honest: logging a set worse than today's
best leaves the top set untouched and celebrates nothing, while logging a better one, or
editing a set into being the best, changes it and does. Deleting a set can only remove a
PR, never create one, so it needs no handling. The after-state is read from the store
with `getState()` rather than from props, which are a render behind by the time an
awaited write resolves.

`useKeepAwake()` holds the screen on for the session; `useRestTimerNotifications()` is
mounted once here.

### Finish, cancel, and the template prompt

**Both end-of-workout actions confirm**, through a real sheet
(`components/shared/ConfirmModal.tsx`) rather than a native Alert. Finish used to commit
on the tap, which on a one-handed sweaty screen meant a mis-tap permanently ended the
workout — there is no un-finish, since finalising stores a duration and turns the
session into a completed record that later sessions get compared against. The confirm
button sits at the bottom of the sheet, below the body, so reaching it means having read
past what the sheet is asking about.

`components/session/FinishWorkoutModal.tsx` does two jobs in one screen, because
they're one decision from the user's side. It opens with a session summary (exercise
count, set count, duration) and — when the exercise list differs from the template it
started from — an **itemised list of what changed**, each row marked added or removed,
with a single checkbox: "Save these changes to Push day." A hint line underneath states
the consequence either way, so the choice isn't inferred from a checkbox state.

This replaced a native Alert offering "Just this once" / "Save to template" as opaque
buttons with no way to show *which* exercises it meant. Folding the question into the
Finish confirmation also avoids two dialogs for one action.

The toggle defaults **off** and resets every time the sheet opens. A template is reused
every week, so silently absorbing one day's improvisation into it is the more expensive
mistake. Accepting rebuilds the list in the *template's* order — template entries still
present, then the additions appended — precisely so saying yes to an add or a remove
can't reorder the template as a side effect. Reordering never prompts, and weights never
prompt at all: there are none stored to prompt about.

Finishing with zero sets logged is allowed but called out in the sheet, since it writes
a real, permanent, empty session into History that later sessions get compared against;
the sheet points at Cancel as the correct exit in that case.

Cancel is the destructive exit, confirmed, naming the number of sets about to be deleted
— see State management for why it isn't equivalent to finishing an untrained session.

The duration shown in the Finish sheet and the duration actually stored come from the
same function (`lib/sessionDuration.ts`), so the preview can't tell the user "52 min"
and then write something else. The History list formats through it too.

### Progress (`app/(tabs)/progress.tsx`, `app/progress/[id].tsx`)

The tab lands on a searchable list of tracked lifts sorted by most recently trained.
`listTrackedVariants` excludes any variant with fewer than two logged sessions — nothing
to plot yet, so nothing to show yet.

The detail view is scoped to one `equipmentVariant` and opens with pills for the sibling
variants of the same exercise. Those are **never merged**: a Hammer Strength line and a
Technogym line stay separate, which is the entire differentiator. Then the current best
top set with its change since the first session, the chart, and a recent-sessions list.

`components/progress/TopSetChart.tsx` draws the chart from the mockup's SVG geometry
verbatim — a 300×132 viewBox, axis hairline at y=118, series between y=26 and y=104,
9px date labels on the baseline — so those numbers stay literal at any phone width via
`aspectRatio` rather than pixel maths. It plots **weight only**; reps are not on the
line, which is the acknowledged limitation the rep floor addresses, and RIR appears in
the session list below, never on the chart. Flat runs and single points sit on the plot
band's centre line rather than dividing by zero — a flat line is the honest picture of
three sessions at the same weight. There's no time-range control (not in v1).

`react-native-svg` is the one charting dependency, chosen over `victory-native` /
`react-native-gifted-charts` because it ships inside the Expo Go runtime: no development
build required, and no gesture/animation stack dragged in for a static eight-point line.
It replaced a plain-`View` bar visualisation that stood in while there was no chart
dependency at all.

### History (`app/(tabs)/history.tsx`, `app/history/[id].tsx`)

The tab lists every completed session with date, gym, exercise count, stored duration,
and improvement count. The detail screen makes a past session **fully editable**, which
CLAUDE.md treats as a normal case rather than an edge case: add an exercise and its sets,
edit or delete individual sets, remove an exercise, correct the gym or date, delete the
whole session. Every derived value — top set, green arrow — is recomputed through the same
shared functions the live screen uses, so an edit here correctly changes the arrow on this
session and on whichever session it's compared against. Duration is the one thing that is
*not* recomputed: it's frozen at finalisation, so adding abs work at 9pm can't turn a
52-minute workout into a five-hour one.

### Exercises (`app/(tabs)/exercises.tsx`, `app/exercise/[id].tsx`)

Browsable first, searchable second: with no query typed, a `SectionList` groups the full
library by muscle group (`lib/groupExercises.ts`), collapsing to a flat search-result
`FlatList` once text is entered. An empty query showing "No exercises found" was a real
bug, not an empty state. The same grouped component backs the mid-workout add-exercise
sheet (`components/session/AddExerciseModal.tsx`), which puts recently-used exercises in
a "Recent" section first and "+ Create new exercise" at the bottom.

`db/seedExercises.ts` ships ~265 generic-named movements across
barbell/dumbbell/machine/cable/bodyweight, generated 1:1 from `notch-seed-exercises.csv`
(regenerate from the CSV; don't hand-edit the two out of sync). Cable is the largest
block at ~70 entries — deliberately, since a single cable stack is the most
variation-dense piece of equipment in a gym and the generic-name rule means each grip,
height, and body position has to be its own entry rather than a modifier on one
"cable curl". Names stay generic —
"Chest press", never "Hammer Strength chest press" — because brand is a separate
attribute resolved per gym. `constants/muscleGroups.ts` is the canonical taxonomy the CSV
and the custom-exercise form both draw from, so a user-created exercise groups into an
existing section instead of splintering off into a one-item "legs" of its own.

The detail screen edits core fields only for custom exercises and renders them read-only
for seeded ones — the escape hatch for wanting something different is creating a custom
exercise, not mutating the shared taxonomy progression scopes against. All three
per-exercise overrides (rest seconds, weight increment, rep floor) are editable
regardless, via `components/exercises/ExerciseOverrideRow.tsx`; that's exactly
CLAUDE.md's "per-exercise override for anything unusual", with no seeded/custom carve-out.
`components/exercises/ExerciseForm.tsx` is shared by all three creation/edit callers.

### Numeric input

`components/shared/NumericField.tsx` is the one component for every weight, rep, RIR, and
(later) rest or goal number. Entering edit mode always starts from an empty draft rather
than pre-seeding the current value, which is what fixes CLAUDE.md's stale-zero bug (typing
"5" into a field showing "0" yielding "05") once, at the component level, instead of
per-screen on every new numeric field. `onChange` fires on every valid keystroke, not on
blur: `EditSetModal`'s Save reads parent draft state the instant it's pressed, and a
blur-only commit raced the field's blur against the button's press — a race `Pressable`
routinely wins on iOS, silently dropping a just-typed value.

### Gym switcher

A pill in Home's header (`components/gyms/GymSwitcherModal.tsx`), defaulting to
`getLastUsedGym` — single-gym users read it as a label, per CLAUDE.md. Picking a different
gym only changes which gym the *next* new session uses; it is not a separately persisted
"current gym", consistent with "gym defaults to the last one used" being derived.

## Known limitations / not yet built

**Deferred by CLAUDE.md, deliberately.** Goals (v2) — the `goals` table exists and is
unused. Bodyweight and assisted movements (v2) — `sets.addedWeight` /
`sets.assistanceWeight` exist from v1 precisely so retrofitting them later isn't painful.
Drop sets, supersets, and myo-reps are explicitly out of scope; log them as ordinary sets.
JSON export is specified for v1 and isn't built yet — it's the only thing standing between
a tester reinstalling and losing everything, so it's the next thing worth building.

**The rep floor is implemented but defaults to 1**, which reproduces v1 behaviour exactly
(heaviest set wins, no filter). It's a read-time filter everywhere — `selectTopSet` takes
it as a parameter — so raising the default later needs no migration and no rework. There
is no Settings screen yet to change it, or to change the unit preference, which is why the
kg path in `lib/units.ts` is implemented but functionally unverified.

**Cross-gym reference display isn't built.** A first session at a new gym currently shows
no pre-fill at all rather than the specified greyed-out home-gym numbers. Honest, but not
yet the specified UX. There is deliberately no calibration math (CLAUDE.md: real data
should inform any conversion logic before it's written), and travel sessions are not yet
drawn as a separate marked series.

**Deletion gaps.** Exercises and gyms can't be deleted; CLAUDE.md never calls for either,
and both raise history-integrity questions — a deleted exercise's `equipmentVariants` are
what every past set points at.

**The two gestures have had one device pass, not a gym pass.** Drag-to-reorder and
swipe-to-delete were tried on hardware and work; that round fixed the dropped card
disappearing (see the drag section) and sized the grip handle up from a 16px glyph to
21px. They remain the highest-risk code in the app — gesture feel is the one thing a
type-check and a bundle build say nothing about, and this is the third attempt at them —
so `constants/features.ts` keeps a runtime kill switch for each, and the commit before
them is tagged `pre-gestures`.

Still unanswered, because they need a long session and a real workout rather than a
quick try: whether **auto-scroll**'s edge threshold (96px) and speed (14px/tick) feel
right when dragging a card across several screens, whether JS-thread gesture handling
stays smooth with a long session on screen, and whether the swipe's horizontal-intent
threshold rejects enough vertical drift to keep the list comfortably scrollable
mid-workout.

**Two vestigial schema columns** (`sessionExercises.status`,
`sessions.currentSessionExerciseId`) are left over from the abandoned stepper design and
are no longer read. See the Data model section.

**The active workout scroll is a plain `ScrollView`.** CLAUDE.md flags a long list of
exercise cards, each containing a table, as a real virtualized-list candidate
(`FlatList`/`FlashList`) and says to decide before performance becomes visible rather than
after. It hasn't been measured on a device yet, so this is a known open question, not a
settled choice.

**Auto-close is swept on Home's focus effect**, not by a background `AppState` listener.
That's correct for the case that matters — Home always reflects accurate
resumable-session state before the user acts on it — but a session backgrounded past the
3-hour threshold won't flip to `complete` until the user next visits Home.

**Nothing here has run on a physical device.** CLAUDE.md's Gotchas are explicit that
simulator scrolling and keyboard behaviour differ from the phone in ways that matter for
this app, and that the logging screen needs one-handed thumb testing. Every layout
decision above is reasoned from the mockups, not observed in a gym.
