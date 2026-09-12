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
detail) from an earlier design pass — is the structural reference for layout, hierarchy,
and spacing; CLAUDE.md stays the source of truth for colors, component behavior, and
every product decision the mockup doesn't settle. Reading it closely resolved things
prose hadn't pinned down: CLAUDE.md says exercises must be reorderable and that "add
exercise" is always reachable, but said nothing about whether the screen shows every
exercise at once or one at a time.

**The mockup answered that question, and the answer was wrong.** Its logging panel is a
single focused exercise with a "3 of 6" position indicator and a "Next" row to advance,
so that's what got built. Then it was used at the gym, and it failed for reasons no
amount of looking at a static image would have surfaced: it locked the user into one
exercise, made it impossible to jump around, and made already-logged sets uneditable.
The screen was rebuilt as one scroll with every exercise visible, and CLAUDE.md gained a
section marked SUPERSEDES recording that the stepper is rejected and must not come back —
because the mockup still shows it, and a later pass would otherwise "correct" the working
design back into the broken one.

That is the real lesson of this section, and it cuts against the section's own premise:
a mockup is excellent evidence about hierarchy, spacing, and what a screen should *feel*
like, and weak evidence about interaction structure, which only survives contact with
the actual use case — one-handed, sweaty, between sets. Using it at the gym cost one
session and invalidated a design decision that had already been implemented twice.

**The conflict resurfaced later, and got asked rather than guessed.** A subsequent
request was "make it look exactly identical to the mockups — anything else will not be
accepted", which, read literally, meant reinstating the rejected stepper. Rather than
silently picking the spec over the instruction (or the reverse), the contradiction was
put back to the requester with both options sketched: mockup styling on the scroll
structure, or the literal mockup including the stepper. The answer was the former, and
the mockup's visual language — the accent-tinted "Last time" block, the numbered set
rows, the bordered steppers, the RIR pill row, the full-width "Log set" button — now
appears verbatim inside a card that repeats down one scroll. Both documents note this
explicitly, in `components/session/ExerciseCard.tsx`'s header comment, so the next
reader doesn't have to rediscover which half of the mockup is authoritative.

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
  something different before and after a reorder. It was replaced with a durable FK
  (`currentSessionExerciseId`) into a new `session_exercises` table, which also looked
  like the only place "skipped" vs. "not yet reached" could live, since `sets` has no way
  to represent an exercise with no sets at all.

  Worth recording that this analysis was *correct about the schema and wrong about the
  product*. Both the FK and the `skipped` status only existed to serve the
  single-exercise stepper; when that design was rejected, the questions they answered
  stopped being questions — with no forced order there is no "current exercise", and
  doing the last exercise first is identical to doing the first one first, so "skipped"
  isn't a state either. `session_exercises` itself turned out to be load-bearing for a
  completely different reason (an exercise has to exist in a session before anything is
  logged for it), so the table survived and two of its columns are now documented dead
  weight. Careful modelling of a mechanism can't tell you whether the mechanism should
  exist.

Both were fixed before writing the screen that would have silently depended on them.
Separately, CLAUDE.md itself briefly contradicted its own spec — the "Logging screen"
section said 5 lb stepper increments while the dedicated "Weight increments" section
said 2.5 lb "not 5" — caught by cross-referencing the two sections rather than
implementing the first one found, and resolved by asking rather than guessing.

## Knowing which tool NOT to reach for

The two gesture features — drag an exercise to reorder, swipe a set to delete — are the
clearest case in this project of the obvious technical answer being the wrong one. The
standard stack for both is `react-native-gesture-handler` plus
`react-native-reanimated`, usually with `react-native-draggable-flatlist` on top. That
combination had already been tried here, and it didn't degrade — it made the active
workout screen fail to render at all, and the work was reverted. (Best reading of the
cause: `react-native-draggable-flatlist` is unmaintained and leans on Reanimated 2/3
APIs that Reanimated 4 removed.)

Reaching for it again, better configured, was one option. The other was React Native's
built-in `PanResponder` and `Animated`: less capable, gesture handling on the JS thread
instead of the UI thread, and more geometry to write by hand — but nothing that can fail
at import time, no native module to mismatch, no babel plugin, and no Expo Go
compatibility question.

The deciding factor was **not being able to test.** There is no Mac, no simulator, and no
device in this environment, so the only signals available are `tsc` and a Metro bundle
build — neither of which has anything to say about whether a gesture works. When the
feedback loop can't distinguish "smooth" from "broken," the right move is to pick the
option whose worst case is "feels imprecise" over the one whose worst case is "blank
screen," and pay for it in hand-written index arithmetic. That inverts the usual
library-versus-DIY instinct, and it only inverts because of the testing constraint.

Three things were put in place alongside the code, for the same reason:

- **A tagged known-good commit** (`pre-gestures`) and a separate branch for the work, so
  reverting is one command rather than an archaeology exercise. Worth noting that the
  baseline commit had to be *created* first — several sessions of work were sitting
  uncommitted, meaning there was no revert point at all at the moment one was requested.
- **Runtime kill switches** (`constants/features.ts`) for each gesture independently, so
  a bad feel can be switched off from the couch without git, and so the two features
  can be evaluated separately rather than as one change.
- **Fallbacks that are complete, not degraded.** With swipe off, a set is still deletable
  from its edit modal. That matters: a feature flag whose "off" state is broken isn't a
  safety mechanism.

The honest status is that all of it is unverified. A clean bundle and a clean type-check
are evidence that the code is *well-formed*, not that the gesture is *good* — and this
project has already learned that distinction the expensive way, when the
single-exercise stepper passed every static check and then failed at the gym.

## Where AI assistance helped, and where it didn't

**Helped**: scaffolding speed (a working Expo + expo-router + Drizzle/SQLite project
with a full migrated schema, same session); catching the settings-row and
current-position gaps above before they became runtime bugs discovered mid-workout;
drafting the migration/query/store function signatures in enough detail to implement
directly; working around a real tooling limitation (drizzle-kit's rename-detection
prompt requires a TTY, unavailable in this shell) by splitting one schema change into
two unambiguous additive/subtractive migrations instead of stalling on it.

**Also helped**: mechanical breadth on work that's tedious rather than hard — growing
the seed exercise library from ~60 movements to ~225 by regenerating
`db/seedExercises.ts` from its CSV source rather than hand-editing two files toward each
other, and noticing in passing that `ensureSeedExercises` was gated on a one-time "have
we ever seeded?" check, which meant the expanded list would silently never reach any
existing install.

**Human judgment was the deciding factor for**: the app's name and its App Store
positioning; resolving the weight-increment contradiction (the dedicated section's
reasoning was more convincing, but it was a genuine two-reading ambiguity, not a typo
an LLM should silently pick a side on); the mockup itself, which came from a separate
design pass outside this process entirely; and the recurring judgment call, revisited
throughout, of what belongs in *this* build step versus what's explicitly deferred to a
later one per CLAUDE.md's build order — the spec describes the whole app, and knowing
which parts of it a given screen is allowed to leave out is a product call, not a
technical one.

**And the single largest correction came from neither**: it came from taking the app to
a gym. The stepper was specified in a mockup, reviewed, implemented, and type-checked
clean; nothing in the static toolchain or the spec could have told anyone it was wrong.
The distance between "this bundles and matches the design" and "this works while you're
holding a dumbbell" is the part of the process that still has to be walked in person.
