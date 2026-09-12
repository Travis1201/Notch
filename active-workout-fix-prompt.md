I used the app at the gym and the active workout flow needs a real redesign, not a
tweak. I've already updated CLAUDE.md to reflect the new decisions — read it first,
specifically the sections "Active workout screen (SUPERSEDES earlier single-exercise-
stepper design)," "Numeric input," and the updated "Mid-workout flexibility" and
"State a live session must persist" sections. This message explains the reasoning and
gives you a concrete task list; CLAUDE.md is the source of truth for the actual rules.

## What's wrong, in order of severity

### 1. The single-exercise stepper has to go

Right now the active workout screen locks me into one exercise at a time — it shows
"3 of 6," and I move forward with a "Next" arrow. This is the core interaction model
and it's wrong. In practice, a real workout doesn't go in a straight line: I superset
informally, I go back to add a set to something I already "finished," I skip around
based on what equipment is free. Being locked to one exercise with no easy way to jump
elsewhere makes the app actively worse than writing it on paper.

I've attached/described a screenshot from Strong (an existing lift tracker) showing the
pattern I want structurally: every exercise in the session is visible in one scrollable
screen, each with its own compact set table (set number, previous performance, weight,
reps, a checkmark to confirm). I don't want a pixel-perfect clone of Strong — the RIR
row, warm-up greying, and rest timer are Notch's own and should stay Notch's own — but
the **structural change is not optional**: one scrollable screen, every exercise
visible, no forced order, tap into anything at any time.

Concretely:
- Replace the single-exercise view with a **scrollable list of exercise sections**, each
  showing that exercise's set table.
- Remove the "N of M" counter and the "Next" arrow entirely. There is no "next" — there's
  just the list.
- Each exercise section gets a **persistent "+ Add set" row** at its bottom.
- A persistent header (elapsed time, Finish button, rest timer control) stays visible
  while scrolling — this part of Strong's layout is worth taking directly, since it's
  what makes the screen usable one-handed.
- **"Add exercise" moves to the bottom of this same scroll**, not a separate flow you
  only reach after "finishing" the current exercise.

### 2. Logged sets must stay editable

Currently, once I log a set, its numbers are locked — I can't go back and fix a typo or
adjust after the fact. Every set row, logged or not, should be tappable to edit its
weight, reps, and RIR for the life of the session. "Logged" should never mean "locked."
(This is separate from the History-editing rules already in CLAUDE.md for *past*
sessions — this is about editability *during* the current one.)

### 3. Numeric input has a real bug: the stale zero

When I tap into a weight or reps field to type a number, the existing "0" doesn't clear
— so typing "5" can produce "05" or otherwise concatenate instead of replacing. This is
a correctness bug, not a nitpick, and it'll resurface on every numeric field we add
later (rest duration, goals, settings) if it's fixed per-screen instead of at the
component level.

Fix this **once, in a shared numeric input component**, and make sure every current and
future numeric field (weight, reps, RIR if it ever becomes free-text, rest duration,
goal weight/reps) uses that component rather than an ad-hoc TextInput. Behaviour:
- Focusing a field that currently reads `0` (or is otherwise a placeholder/default value)
  clears it so the first keystroke starts clean.
- Select-all-on-focus is an acceptable and arguably better alternative — it also lets me
  fully retype a non-zero value (correcting 185 to 135) without manually deleting digits
  first.
- Blurring an empty field resolves it to a sensible default rather than leaving the
  underlying state blank or NaN.

### 4. The exercise picker is broken, not just unpolished

Right now, opening "Add exercise" with an empty search shows "No exercises found." That
reads like the seed exercise list either isn't loaded or the picker is search-only with
no default browse state — either way it's a bug. I want to be able to **scroll through
the exercise library and tap what I want**, and *also* be able to search when I know the
name. Fix:
- With an empty query, show the **full scrollable list** of exercises (seed list +
  anything I've created), not an empty state. Group them sensibly — muscle group is fine,
  or recent/frequent-first if that's already implemented for pre-fill elsewhere.
- The search field filters that same list live as I type. It should feel like narrowing
  a list I'm already looking at, not switching into a different mode.
- "+ Create new exercise" stays available at the bottom regardless of query state.
- If the seed CSV I gave you earlier never actually got loaded into the database, that's
  the root cause here — verify it's seeded before assuming the UI logic is the only bug.

## What to keep as-is

Don't use this as an excuse to redesign things I didn't flag:
- The RIR row (0/1/2/3/4+ tap targets), warm-up inference and greying, and the rest
  timer's behavior are all fine conceptually — they just need to fit into exercise
  sections within the new scroll instead of dominating a single-exercise screen. Shrink
  their visual footprint if needed, don't cut them.
- Do not add a superset/chain-link feature. I noticed Strong has one — supersets are
  explicitly deferred in CLAUDE.md. Leave it out entirely rather than adding a disabled
  version of it.
- Weight/rep steppers (+/-) should still exist for quick nudges — the fix is that direct
  tap-to-type editing also needs to work correctly (see the numeric input bug above), not
  that the steppers get removed.

## Suggested order of attack

1. Fix the numeric input component first (#3) — it's small, self-contained, and every
   other screen you touch after this benefits from it immediately.
2. Fix the exercise picker (#4) — likely a data/query bug plus a default-state fix,
   independent of the bigger screen rework.
3. Rebuild the active workout screen around the scrollable multi-exercise model (#1),
   using the fixed numeric input component for every field.
4. Make logged sets editable within that new screen (#2) — this mostly falls out
   naturally once sets are just rows in a table rather than a single locked "current set"
   view, but confirm it explicitly.

Re-read the updated CLAUDE.md sections before starting — they contain the exact rules
(no forced order, header layout, where "last time" data lives, why supersets are
excluded) that this task list is summarizing.
