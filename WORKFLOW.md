# Workflow

How Notch is actually being built with AI assistance — a record of the process, not a
prompting tutorial. Updated as the build proceeds; treat gaps between this and the
actual git history as this doc being behind, not the history being wrong.

---

## Spec-first development

CLAUDE.md existed before any code did, and every product decision in it — top-set
selection, the warm-up-inference-instead-of-a-toggle call, the 1RM rejection, the
"never build an update-template-weights prompt" rule — was argued through and written
down with *why*, not just *what*. That matters mid-build: when a rule's reasoning is on
record, it doesn't get re-litigated three files later just because it's briefly
inconvenient. Several rules in CLAUDE.md exist specifically because interrogating an
edge case before writing code surfaced a requirement that would have been expensive to
retrofit — the multi-gym problem, machine-specific tracking, templates never storing
weights.

The spec itself moved mid-build, and the code followed it, not the other way around:
partway through scaffolding, the project's name changed from "Lift Tracker" to "Notch"
directly in CLAUDE.md (with a "Naming" section explaining the subtitle/keywords split
and the App Store search-conflict check), and the rename was carried through
`app.json`, `package.json`, and the local database filename as a follow-up pass against
the already-updated spec — not the spec being adjusted to match code already written.

## Empirical testing over speculation, adapted to this environment

The predecessor project (a Spotify alarm) died after roughly five candidate
architectures were each eliminated by a cheap, minutes-not-overnight test on real
hardware, isolating one variable at a time. This project doesn't have a Mac or an iOS
simulator available in the dev environment at all, so "test on real hardware" splits
into two explicit lanes instead of one:

- **What gets verified here, before you ever see it**: `tsc --noEmit` (strict-mode
  type coverage), `expo-doctor` (config/plugin wiring), and `npx expo export` as a
  bundle-build smoke test. That last one isn't ceremony — it's what caught a real
  mistake during scaffolding: `db/schema.ts` originally imported `expo-crypto` for UUID
  generation, which pulled React Native's Flow-typed source into drizzle-kit's esbuild
  loader and broke migration generation outright. The fix (a dependency-free UUID
  function in `db/uuid.ts`, schema.ts forbidden from importing any Expo/RN runtime
  module) came from that failure, not from anticipating it.
- **What genuinely requires your device via Expo Go**: anything that depends on real
  runtime behavior — SQLite writes actually surviving a force-close, local
  notifications firing while the phone is locked, haptics, the rest timer's countdown
  under backgrounding. Each implementation pass ends with an explicit, numbered list of
  what to test by hand and why static checks can't substitute for it — not a vague
  "give it a try."

## Design by iteration on artifacts

`notch-ui-mockups.html` — three key screens (Home, active workout/logging, Progress
detail) from an earlier design pass — is the structural reference for layout,
hierarchy, and spacing; CLAUDE.md stays the source of truth for colors, component
behavior, and every product decision the mockup doesn't settle. Reading it closely
changed the logging screen's architecture in a way prose alone hadn't pinned down:
CLAUDE.md says exercises must be reorderable and skippable and that "add exercise" is
always reachable, but never says whether the screen shows every exercise in the session
at once or one at a time. The mockup answers that concretely — a single focused
exercise with a "3 of 6" position indicator and an explicit "Next" row to advance —
which turned a planned scrollable stack of exercise cards into a single-exercise-focused
paginated view, with skip/reorder/add-exercise/jump-to-exercise consolidated into one
sheet reachable from the header instead of inline controls on every card. This is
exactly the kind of thing a mockup catches that a spec description doesn't.

## Constraint discovery before building, not after

Before any logging-screen code was written, a research pass re-verified the current
disk and spec state from scratch (rather than trusting memory of what had been built
minutes earlier) and a separate design pass worked through the concrete implementation.
That process surfaced two real gaps neither would have been obvious from reading
CLAUDE.md alone:

- The `settings` singleton row was never actually being inserted anywhere — the
  migration only defines column *defaults for future inserts*, so every
  `defaultRestSeconds`/`defaultWeightIncrement`/`defaultRepFloor` lookup would have hit
  an empty table the moment the logging screen tried to read it.
- `sessions.currentPosition`, a bare integer, can't represent "which exercise is
  current" once reorder and skip are both in play — an index into a list means
  something different before and after a reorder. It's replaced with a durable FK
  (`currentSessionExerciseId`) into a new `session_exercises` table, which also turned
  out to be the only place "skipped" vs. "not yet reached" (both zero-set states, per
  CLAUDE.md) could actually live, since `sets` has no way to represent an exercise that
  has no sets at all.

Both were fixed before writing the screen that would have silently depended on them.
Separately, CLAUDE.md itself briefly contradicted its own spec — the "Logging screen"
section said 5 lb stepper increments while the dedicated "Weight increments" section
said 2.5 lb "not 5" — caught by cross-referencing the two sections rather than
implementing the first one found, and resolved by asking rather than guessing.

## Where AI assistance helped, and where it didn't

**Helped**: scaffolding speed (a working Expo + expo-router + Drizzle/SQLite project
with a full migrated schema, same session); catching the settings-row and
current-position gaps above before they became runtime bugs discovered mid-workout;
drafting the migration/query/store function signatures in enough detail to implement
directly; working around a real tooling limitation (drizzle-kit's rename-detection
prompt requires a TTY, unavailable in this shell) by splitting one schema change into
two unambiguous additive/subtractive migrations instead of stalling on it.

**Human judgment was the deciding factor for**: the app's name and its App Store
positioning; resolving the weight-increment contradiction (the dedicated section's
reasoning was more convincing, but it was a genuine two-reading ambiguity, not a typo
an LLM should silently pick a side on); the mockup itself, which came from a separate
design pass outside this process entirely; and the recurring judgment call, revisited
throughout, of what belongs in *this* build step versus what's explicitly deferred to a
later one per CLAUDE.md's build order — the spec describes the whole app, and knowing
which parts of it a given screen is allowed to leave out is a product call, not a
technical one.
