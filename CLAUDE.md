# Notch

A progressive-overload tracker for experienced lifters. React Native (Expo), fully
on-device, no backend.

## Naming

- **App name:** Notch
- **App Store subtitle (visible, ~30 char limit):** "Progressive overload tracker" — keep
  this precise to what makes the app different, not generic gym-app language.
- **App Store keywords field (invisible, ~100 char, search-only):** cover the generic
  terms the subtitle has no room for — gym, log, workout, tracker, lifting, strength, PR,
  sets, reps. This is where "gym log" / "workout tracker" search traffic gets captured,
  the same job those words do in competitors' visible titles.
- **Bundle identifier is effectively permanent once submitted to App Store Connect.**
  Decide it now (e.g. `com.<username>.notch`) even though the display name can still
  change later.
- Search the App Store for "Notch" before committing — it's also a common term for the
  iPhone's screen cutout, so check carefully.

Built for the author's own use first, but **intended for TestFlight and eventual App
Store release** — friends as testers, and a public link recruiters can install from.

---

## Who this is for

**Experienced lifters who already know what they're doing.** This is the core product
decision and it should be defended in every feature debate.

The app never recommends a program, never suggests exercises, never shows form videos,
never explains training concepts. Users arrive with a plan and enter it themselves.

This deletes entire categories of feature and is why the app can stay small.

---

## Hard constraint: no data collection

**The app collects nothing. No accounts, no analytics, no telemetry, no crash-reporting
SDK, no network calls of any kind.** All data stays on the device.

This is a deliberate product decision, not an oversight or a v1 shortcut. Do not add an
analytics or error-reporting dependency "just for debugging" — it would change the App
Privacy labels from *no data collected* to something requiring disclosure, and that
property is worth more than the convenience.

Consequence: there are no crash stack traces from testers. Apple's own crash reports
appear in App Store Connect for TestFlight builds without any SDK, since the OS collects
them rather than the app. Less detail than a reporting service, and sufficient.

Any proposal that adds a network call should be treated as a change to this constraint
and raised explicitly.

---

## The differentiator

Most trackers have one generic "Chest Press" entry, so a Hammer Strength number and a
Technogym number land in the same bucket and the progression chart becomes noise.

This app scopes progression to **exercise + gym + equipment brand**. Same movement on a
different machine is a different progression line, because it genuinely is.

---

## Core design principle: confirm, don't input

Logging happens between sets — sweaty, one-handed, in a hurry. Every tap counts.

The app should almost always be pre-filled with last session's numbers and asking for
confirmation rather than entry. Applies everywhere:

- Templates pre-fill every exercise with last session's weight and reps
- Equipment brand defaults to whatever was used last time for that exercise at that gym
- Gym defaults to the last one used; most users never touch the switcher
- Warm-up sets are inferred, not asked about (see below)

**Most abandoned lift trackers die on data-entry friction, not missing features.** If
logging a set takes more than a couple of taps, the app has failed.

---

## Decided behaviour (do not re-litigate)

### Progression

- **Only the top set counts.** Defined as the heaviest weight in that exercise for that
  session; if two sets share the top weight, the one with more reps wins.

**Put top-set selection in ONE named function.** The chart, the green arrow, PR
detection, and goal checks must all call it. These four conceptually duplicate the rule;
if they drift, the app shows a green arrow that contradicts its own chart, which quietly
destroys trust in every number.

#### Rep floor (planned, not v1)

Two dimensions (weight and reps) can't both fit on one line, so a weight-only chart can
show a false dip: 230x4 one week, 225x8 the next, and progress looks like regression.

The fix is a **minimum rep floor** — only sets meeting the floor are eligible to be the
top set. A 230x4 with a floor of 6 simply isn't plotted, so no phantom dip. This works
because the user trains 6-8 to failure; an off-protocol heavy triple shouldn't define
their progression any more than a warm-up should.

- It's a **floor only**, not a range. An upper bound does nothing for top-set selection.
- One global default in settings, with a per-exercise override. Never asked mid-workout.
- **A floor of 1 reproduces v1 behaviour exactly**, so build v1 with the rule above and
  change a default later. No migration, no rework — this is a read-time filter, not a
  schema decision.
- A session where nothing meets the floor produces no chart point. It's still logged and
  visible in the session list. That's correct: a bad day isn't a strength decline.

Estimated 1RM as a chart axis was considered and **rejected** — the user doesn't trust
the formulas and doesn't max out on machines.
- Progression is tracked per **exercise + gym + brand** combination.
- **RIR is logged on every working set.** It's context, not a gate — see Goals.

### Goals

- Goals are expressed as **weight × reps**, never estimated 1RM. The user rejected 1RM
  as a target: formulas aren't accurate enough, and the goal should be something you can
  physically watch yourself do.
- A goal is met when the user hits **both** the target weight and target reps in a
  single set. 315x7 satisfies a 315x6 goal. 320x5 does not. 320x6 does.
- **RIR does not affect whether a goal is met.** 315x6 at 0 RIR counts. RIR is displayed
  alongside the achievement as context, not used as a threshold.
- Estimated 1RM may be used **internally** for trend projection (rep-max goals are too
  discrete to forecast from). It must never appear in the UI as a target.

### Warm-up sets

Do **not** add a warm-up/working toggle to the logging flow. It's friction the user
explicitly rejected.

**Infer them instead:** any set logged before the top set, at a weight below the top
set, in the same exercise, is a warm-up. Render greyed out. Tap to override.

Warm-ups are excluded from all progression calculations.

### Units and conventions

- **Dumbbells are logged per hand.** A 100 lb dumbbell logs as 100, not 200. Label this
  clearly in the UI.
- Unlabeled machine stacks (plates numbered 1-15) get no special feature. Users log the
  number as if it were weight; progression is relative so it still works.

### Multi-gym

- A set belongs to a **gym**. Equipment brand is an attribute of the machine, not the
  identity of the exercise.
- Single-gym users should never see any of this. One gym is created on first launch and
  auto-selected forever.
- First session at a new gym has nothing to pre-fill. Show the home-gym numbers as a
  **greyed-out reference**, clearly marked as a different gym. Don't claim they're
  comparable; just give a starting point.
- Travel sessions appear as a separate marked series on charts, not merged into the home
  progression line.
- **No calibration math in v1.** Record gym, equipment, and RIR, and display sessions
  separately. Real data should inform any conversion logic before it's written.

---

## Stack

- **React Native via Expo** (managed workflow)
- **TypeScript**, strict mode
- **expo-router** for navigation
- **expo-sqlite** for local persistence, with **Drizzle ORM** for typed queries and
  migrations
- **Zustand** or React Context for the active-workout session state
- **victory-native** or **react-native-gifted-charts** for progression graphs
- **No backend, no auth, no network calls**

### Why Expo over native Swift
No Mac available. Cloud-compiling Swift means losing Xcode's simulator, previews, and
debugger — the tooling that makes Swift worth using. Expo's hot reload gives a
sub-second feedback loop, which matters enormously for a UI-heavy app.

### Why not a PWA
Real native components matter for daily gym use. The PWA avoids sideloading entirely and
remains a reasonable fallback if the refresh cycle becomes annoying — much of the React
would carry over.

### Development vs. distribution
**Expo Go** is for development: scan a QR code, hot reload while building.
**EAS Build + EAS Submit** produce and upload the production build. See Distribution.

---

### Templates

**A template stores structure only — an ordered list of exercises. It never stores
weights, reps, or RIR.**

All numbers shown when starting a workout are read live from the most recent session
of that exercise on that equipment variant. There is no stored value to go stale, so
there is nothing to "update" after a session where the user progressed. Tuesday's PR
is automatically what Thursday pre-fills.

This also handles cases a snapshot would get wrong:
- Logging an exercise in an empty workout still updates what the template pre-fills
- Travelling doesn't contaminate home numbers, because pre-fill is scoped to
  exercise + gym + equipment

**Never build an "update template weights" prompt.** It's the wrong model.

Once templates exist, a session started from one has an actual planned exercise
count — show it somewhere (e.g. in the active workout header, or on the session once
finished). This is **not** the old "N of M" stepper counter (that's gone for good, see
"Active workout screen") — no forced order, no gating, purely "X of Y logged so far,"
the same display-only spirit as an untouched exercise's dimming. An empty/ad-hoc
session has no template and so has no such count to show.

#### Structure changes DO prompt

If the finished session's exercise list differs from the template (added, removed, or
reordered), ask **once** on completion:

> Add cable fly to Push day?  [Add to template] [Just this once]

Weights never prompt. Structure prompts only when it actually changed.

### Mid-workout flexibility

A real workout deviates from the plan constantly. The app must not fight this.

- **Add exercise** is a persistent row at the bottom of the session's exercise list, not
  behind a menu. Tapping opens a search sheet; one tap adds it and drops straight into
  its section with pre-filled numbers. "Create new exercise" sits at the bottom of that
  same sheet.
- **The exercise picker must be browsable, not search-only.** Currently, an empty query
  shows "No exercises found" — that's a bug, not an empty state. With no query typed,
  show the **full scrollable exercise library by default** (seed list + user-created),
  reasonably grouped (e.g. by muscle group, or recent/frequent first per the existing
  pre-fill logic) so the user can scroll and tap without typing anything. The search bar
  filters that same list live as text is entered; it doesn't replace browsing.
- **No explicit "Skip."** With every exercise always visible and no forced order,
  there's nothing left for a skip action to do — doing the last exercise on the list
  first is identical to doing the first one first, and a session isn't asked about
  exercises it never touched. An exercise with zero sets logged is just that: display-
  only, never a gate, never prompted about at Finish (see "State a live session must
  persist"). **Reorder** — changing the scroll's display order, a pure preference with
  no functional effect — must still be available mid-session.

---

## Visual design

### Color
- Accent is a deep, desaturated blue (`#185FA5`-ish). Not a bright/saturated blue.
- Green (`--text-success`) is reserved for progression indicators only.
- Neutral greys/near-black for everything else. Colour should carry meaning, never
  decorate.
- Per-template colour dots identify training days at a glance.

### The green up-arrow
Marks a lift whose top set beat the previous session on the same equipment variant.

- Appears on the logging screen next to the set, and as a count on home-screen template
  rows ("Pull day ↗2" = two lifts improved last time).
- **A session with zero improvements shows nothing** — no red arrow, no "0". Users train
  near failure by design; flat sessions are routine and must not read as failure.
- The definition must be computed identically everywhere it appears (logging screen,
  home, history). Put it in one shared function.

### Home screen
- Templates are the entire screen. No dashboard, no summary stats, no recent-session
  list — History has its own tab.
- The template longest-since-performed is surfaced as a single accent hero card showing
  its exercises with last session's top set beside each, plus a full-width start button.
  This is ordering by recency, not recommending a program.
- Remaining templates and "Empty workout" are plain hairline-divided rows below.
- Gym selector is a small pill in the header. Single-gym users read it as a label.
- Tab bar: Home / Progress / Exercises / History.

### Active workout screen (SUPERSEDES earlier single-exercise-stepper design)

**The original spec called for a single-exercise stepper — one exercise on screen at a
time, "3 of 6," a forced Next arrow. This was built, used at the gym, and rejected. It
is wrong and must not be reintroduced.** The failure: it locked the user into one
exercise, made it impossible to jump around, and made already-logged sets uneditable.

**The model is now a single scrollable screen showing every exercise in the session at
once**, closer to how Strong's active-workout screen works (see reference screenshot).
Not a clone — the RIR row, warm-up greying, and rest timer are still Notch's own — but
the core structural change is real and non-negotiable:

- **All exercises in the session are visible in one vertical scroll**, each as its own
  card/section with a small set table (Set # / Previous / Weight / Reps / RIR / check).
  No per-exercise "screen." No forced order.
- **The user can tap into any exercise, any set, in any order.** Nothing is locked to
  "current exercise." Scrolling up to a previous exercise and logging another set there
  must work exactly like scrolling down to the next one.
- **Every logged set remains editable for the life of the session** (and after, per
  History editing). Tapping a completed set's weight or reps opens it for correction —
  logged is never the same as locked.
- Each exercise section has its own **"+ Add set"** control, and its own row for warm-up
  greying (inference still applies per set, unchanged).
- **Adding an exercise mid-workout happens at the bottom of this same scroll** — a
  persistent "+ Add exercise" row, not a separate screen reached only when "finished"
  with the current one.
- A persistent header stays visible while scrolling: elapsed time, a Finish button, and
  the rest-timer control. This is the one piece of Strong's layout worth copying
  directly — it's what makes the screen usable one-handed at arm's length.
- "Last time" reference data (weight × reps @ RIR) shows per exercise, near its set
  table — still surfaced without navigating away, just relocated from "above the single
  input" to "within that exercise's card."
- RIR entry per set can be a compact row within the set's line/expansion rather than
  claiming the whole screen — it needs to fit into a multi-exercise scroll now, so it
  should be visually lighter than in the original single-exercise design.
- Do **not** add Strong's superset/chain-link icon. Supersets are explicitly out of
  scope (see Explicitly deferred) — omit that control entirely rather than build it
  disabled.
- Keep weight/reps steppers (+/-) available for quick adjustment, but every numeric
  field must also support direct tap-to-edit. See "Numeric input" below for the bug this
  surfaced.

### Numeric input (bug — fix at the component level, not per-screen)

Tapping a weight/reps field currently leaves a stale **"0" in place**, so typing appends
instead of replacing (typing "5" after an existing "0" yields "05" or similar) — a
correctness bug, not a style note.

**Fix once, in a shared numeric-input component, and use it everywhere a weight, rep
count, RIR, or (later) rest duration or goal number is entered** — not fixed separately
on each screen, since the same bug will otherwise resurface on every new numeric field
(rest duration, goals, settings).

Required behaviour:
- Focusing a field whose value is `0` or unset clears it, so the first keystroke starts
  clean rather than concatenating.
- Select-all-on-focus is an acceptable alternative to clearing, and is arguably better —
  it lets a full retype replace an existing non-zero value too (e.g. correcting 185 to
  135 shouldn't require manually deleting each digit).
- An empty field on blur should resolve to a sensible default (0, or the last valid
  value) rather than being left blank in the underlying state.

### Progress tab
- Lands on a searchable list of tracked lifts, sorted by most recently trained. Tapping
  one opens the detail view.
- Detail view: equipment variant pills at top (Hammer Strength / Technogym — **never
  merged**, that's the whole differentiator), current best top set with change since
  start, a line chart of top-set weight over time, then a recent-sessions list.
- The chart plots **weight only**. Reps are not on the line — that's the acknowledged
  limitation the rep floor addresses. The session list directly below carries reps and
  RIR, which is why it isn't on a separate screen.
- RIR appears in the session list, never on the chart. It's context for reading a number,
  not a trend to follow.
- Variants with only one or two logged sessions shouldn't appear until there's enough
  data to plot.
- No time-range control in v1. Add 3M / 1Y / All once there's enough history to need it.

### Interrupted sessions
If the app closes mid-workout, the home screen's hero becomes a "Resume workout" card
instead of the template list.

---

## In-progress sessions

A session row is created when the user taps **Start**, with `status = in_progress` — not
when they finish. Each set writes to the database **as it is logged**, never batched to
the end.

**This is not optional.** iOS terminates backgrounded apps. If session state lived only
in component state, a phone call mid-workout could wipe everything logged so far — the
failure mode most likely to make someone abandon the app.

### State a live session must persist
- Which exercises are in the session and their order (for display and for the
  eventual template-diff prompt) — **not** a "current exercise" pointer. There is no
  forced order to track; every exercise's section is independently loggable at any time.
- Which exercises have zero sets logged yet, if that distinction is still useful for
  visual treatment (e.g. dimming an untouched section) — but this is display-only, never
  a gate on interaction.
- Exercises added mid-workout (drives the template-update prompt on completion)
- `status` so the app knows on launch whether to offer Resume

### Duration
Calculated **once, when the session is finalised**, as last set timestamp minus first set
timestamp — then **stored as a column**. Never close time minus start time; users
routinely forget to hit Finish, and a session finalised the next morning must still read
"52 min".

Storing rather than deriving is deliberate: retroactive edits (see History editing) must
not inflate a past workout's duration.

### Auto-close
Close a session after **3 hours of inactivity** (measured from the last logged set, not
from session start). Long sessions are legitimate; closing an active workout out from
under someone is far worse than a stale one sitting open.

Auto-close **finalises and keeps all logged sets**. It only flips status so the session
stops appearing as resumable. Never discard data.

If a user returns after an auto-close, they get a new session. Don't build a merge flow
in v1.

---

## History editing

Past sessions are **fully editable**. This is a normal case, not an edge case — users
forget sets, mistype weights, or train something on a whim without adding it first. An
app that makes bad data permanent gets abandoned.

Support:
- Adding an exercise (and its sets) to a completed session, including one performed on a
  whim and never added to the session at the time
- Editing or deleting individual sets
- Correcting a session's gym or date
- Deleting a whole session (confirm first — the only destructive action in the app)

### Consequences for the data model

**Duration is frozen.** See above. Adding abs work at 9pm must not turn a 52-minute
workout into a 5-hour one.

**Never store PR / "beat previous" as a column.** Adding a set to a past session can
change the green arrow on that session *and* on every session after it. Stored flags go
stale silently and history starts contradicting the charts. Compute these at read time,
through the same top-set function everything else uses.

The same applies to anything else derived from set data — pre-fill values, chart points,
goal achievement. Derive, don't cache.

**History edits do not prompt about templates.** The template-update prompt is a
finish-workout interaction. Someone fixing a typo from three weeks ago should not be
asked about their Push day template.

---

## Distribution

**No Mac required.** `eas build` and `eas submit` both run on macOS, Linux, and Windows —
the build runs on EAS infrastructure and EAS Submit uploads the `.ipa` to App Store
Connect. Node and a terminal are the only local requirements.

**A paid Apple Developer account ($99/yr) is required.** There is no free path to
TestFlight or the App Store.

### Two stages

**1. TestFlight — do this early and often.**
- Needs a production build with `"distribution": "store"` in `eas.json`.
- **Internal testing**: your own App Store Connect team, no review, available as soon as
  the build finishes processing (usually 10-15 min). This is the fast loop.
- **External testing**: anyone else. The group's first build must clear Apple's Beta App
  Review. A public TestFlight link is the smoothest way to hand the app to a recruiter.
- The first EAS cloud build must run interactively so EAS can set up the distribution
  certificate and provisioning profile. Subsequent builds can be non-interactive/CI.

**2. App Store — only once it's genuinely polished.** A TestFlight build is not
automatically released; production requires completing metadata and screenshots in App
Store Connect and passing full App Review.

### What shipping requires that a personal app doesn't

- **App name, bundle identifier, icon, and splash** in `app.json`, plus a version and
  build number that increments on every submission
- **Screenshots** at the required iPhone sizes
- **Privacy policy URL** and **App Privacy labels**. These are simple here: the app has no
  backend, no accounts, no analytics, and no network calls, so the honest answer is *no
  data collected*. Keep it that way — adding any analytics SDK changes this materially.
- **Support URL**
- Age rating questionnaire

### Design consequences

Distribution raises the stakes on things already in this spec:

- **Onboarding and empty states matter much more.** A first-time user who isn't the author
  lands on a blank home screen. The "Create your first template" path is now a primary
  flow, not a nicety.
- **JSON export moves from nice-to-have to important.** There's no cloud backup; a tester
  who reinstalls loses everything. Say so plainly in the UI.
- **The experienced-lifter framing still holds.** Don't add beginner programs or form
  guidance to broaden appeal — a focused app that does one thing well is a better
  demonstration than a bloated one.
- No accounts or auth are needed. Data stays per-device.

### Notes
- Apple's guideline 4.2 (minimum functionality) is not a concern for a real tracker, but
  a half-finished submission will be rejected. TestFlight first.
- **Do not integrate HealthKit** without deliberate intent — it adds review requirements
  and privacy obligations for no benefit at this scope.
- Free-tier EAS includes a limited number of lower-priority iOS builds per month; expect
  a queue.

---

## Rest timer

The user relies on a watch timer today specifically because phone-app timers are badly
structured. Get this right.

- **Auto-starts the moment a set is logged.** Never a separate tap.
- Duration is remembered **per exercise** — squats need longer rest than curls. Default
  around 2-3 min, adjustable inline.
- Countdown displays on the logging screen itself, where the user is already looking.
- Fires a **local notification** when it ends (`expo-notifications`), so it works with the
  phone locked and pocketed. Haptic on completion.
- Skippable and adjustable mid-countdown without leaving the screen.

---

## Units

- A **single-row settings table** holds the unit preference (lb / kg).
- **Store every weight internally in pounds.** Convert only at the UI boundary — display
  and entry.
- Switching units then becomes purely presentational and cannot corrupt history. Storing
  whatever number was typed breaks the moment anyone switches.
- Default is lb.

---

## Weight increments

**Default step is 2.5 lb**, not 5.

This works because the stepper always adjusts a **pre-filled** value — the user moves one
or two taps from last session's number, never climbing from an empty field. Pre-fill is
what makes the small increment viable.

- Tapping the number itself opens direct entry for the rare large jump.
- Per-exercise override for anything unusual.
- Reps always step by 1.

---

## Empty states

**Never seed fake templates, workouts, or history.** A new user must not have to delete
placeholder content. Empty means empty.

But empty should still guide:
- **Home, no templates:** the hero card becomes "Create your first template" with the
  same prominence the workout card would have. Empty workout stays available below.
- **Progress, fewer than 2 sessions for a lift:** explain that a trend needs a couple more
  sessions rather than rendering a one-point chart.
- **History, no sessions:** a single line, not an illustration.

---

## Backup and export

**Include in v1.** There is no server, so a lost phone means a lost training history.

- One button in settings: export everything as JSON to the iOS share sheet.
- Include schema version in the export.
- Import can wait for v2, but the export format should be designed so import is possible.

---

## Seed exercise list

Ship roughly 60 common movements so a new user isn't creating everything by hand. Each
needs a name, muscle group, and equipment type.

Cover the standard barbell lifts, dumbbell work, common machine and cable movements, and
bodyweight basics. Keep names generic — "Chest press", not "Hammer Strength chest press",
since equipment brand is a separate attribute resolved per gym.

User-created exercises remain a first-class path; the seed list is a convenience, not a
constraint.

---

## Data model

SQLite via Drizzle. Rough shape — adjust as needed, but preserve the relationships.

**gyms** — id, name, is_default

**exercises** — id, name, muscle_group, equipment_type (machine / barbell / dumbbell /
cable / bodyweight), is_custom, rest_seconds (nullable, falls back to settings default),
weight_increment (nullable, falls back to settings default), rep_floor (nullable, falls
back to settings default). User-created exercises are a first-class path, not an edge
case.

**equipment_variants** — id, exercise_id, gym_id, brand (nullable). This is the unit
progression is tracked against. Created implicitly the first time a user logs that
combination.

**templates** — id, name
**template_exercises** — template_id, exercise_id, position

**sessions** — id, date, gym_id, template_id (nullable), status (in_progress /
complete), current_position, duration_seconds (nullable until finalised)

**sets** — id, session_id, equipment_variant_id, weight (stored in lb), reps, rir,
position, logged_at, is_warmup_override (nullable; null means use inference),
added_weight (nullable), assistance_weight (nullable)

**settings** — single row: unit preference, default rest duration, default weight
increment, default rep floor

**goals** — id, equipment_variant_id, target_weight, target_reps, created_at,
achieved_at (nullable)

### Schema notes

`added_weight` and `assistance_weight` should exist on `sets` **from the start**, even
though bodyweight and assisted movements are v2. Retrofitting them later is painful.

Assisted movements will be modelled as **one exercise with an assistance value that can
reach zero**, so assisted → bodyweight → weighted is a single continuous progression
line. Do NOT create a separate "Assisted Pull-Up" exercise — it splits history exactly
at the most motivating moment.

Keep the schema sync-friendly (stable IDs, timestamps, no destructive updates) in case
cloud backup is ever added.

---

## Scope

### v1
- Exercise library with a small seed list + user-created exercises
- Gyms (single-gym users never see the UI)
- Equipment brand via combobox: filters a seed list of majors (Hammer Strength,
  Technogym, Life Fitness, Cybex, Nautilus, Precor, Matrix), accepts free text, remembers
  per exercise+gym
- Templates for training days
- Active workout logging with pre-fill from last session
- RIR on every working set
- Warm-up inference
- Top-set progression charts per equipment variant
- Workout history

### v2
- Goals with projected timelines
- Bodyweight movements with added weight
- Assisted movements
- Cross-gym reference display and any calibration logic
- Cloud backup / sync

### Explicitly deferred
Drop sets, supersets, myo-reps. Log them as ordinary sets in the meantime.

---

## Build order

Each step independently verifiable.

1. **Expo project + Drizzle schema and migrations.** Get the data model right before any
   real UI.
2. **Active workout logging screen.** Build this before anything else and use it at the
   gym with seeded fake data for a week. This screen is where the app lives or dies;
   everything else is easy and rarely opened.
3. Exercise library + user-created exercises
4. Gyms + equipment brand combobox with per-exercise memory
5. Templates and pre-fill from last session
6. Warm-up inference + override
7. Top-set progression charts
8. History browsing

---

## Gotchas

### Logging UI
- Weight and rep entry needs large tap targets and `keyboardType="decimal-pad"`, not the
  default keyboard.
- "What did I do last time" must be visible **within the relevant exercise's section**,
  not one navigation away.
- Test one-handed with a thumb. That's how it'll actually be used.
- Keep the screen awake during an active workout (`expo-keep-awake`) — the screen locking
  between sets is a real annoyance.
- A long scroll with many exercise cards, each containing a table, is a real virtualized-
  list candidate (`FlatList`/`FlashList`) rather than a plain `ScrollView` once sessions
  get long — worth deciding before performance becomes a visible problem, not after.

### expo-sqlite + Drizzle
- Use the async API (`openDatabaseAsync`), not the legacy sync one.
- Drizzle migrations need to be generated at build time and bundled; they don't run from
  the filesystem the way they would on a server.
- Wrap multi-row writes in transactions — partial writes mid-workout are a real failure
  mode.

### State
Keep the in-progress workout in memory and write to SQLite on each set commit. Don't
rebuild the whole session from the DB on every render, and don't defer all writes to the
end of the workout — a crash mid-session must not lose logged sets.

### Warm-up inference edge case
The inference only looks at sets *before* the top set. A user who works up and then does
back-off sets at lighter weight will have those back-offs land after the top set. Decide
explicitly how they're treated and make the override obvious.

### Expo specifics
- Test on a real device early. Simulator scrolling and keyboard behaviour differ from
  the phone in ways that matter for this app.
- Some libraries require a development build rather than Expo Go. Check before adopting a
  charting library.


---

## Documentation deliverables

This project doubles as a demonstration of an AI-assisted development workflow. Produce
two additional documents alongside the code and keep them current as the build proceeds.

### WORKFLOW.md

How this project was actually developed with AI assistance. Not a tutorial on prompting —
a record of the process and what it produced.

Should cover:
- **Spec-first development.** Every product decision was argued through and written into
  CLAUDE.md before any code existed. The spec records not just what was decided but why
  alternatives were rejected, so they don't get re-litigated mid-build.
- **Empirical testing over speculation.** The predecessor project (a Spotify alarm) died
  after roughly five candidate architectures were each eliminated by a cheap test on real
  hardware — native app, Web Playback SDK, App Remote SDK, server-side cron, and iOS
  Clock alarm triggers. Tests were designed to take minutes, not overnight, and to
  isolate one variable at a time. Knowing when to kill a project is part of the workflow.
- **Design by iteration on artifacts.** UI was settled by generating mockups and reacting
  to them rather than specifying in prose. Several rounds, each with specific critique.
- **Constraint discovery.** Several requirements (machine-specific tracking, the
  multi-gym problem, template weights going stale) emerged from interrogating edge cases
  before building, not from hitting them in production.
- Honest assessment of where AI assistance helped and where human judgment was the
  deciding factor.

### ARCHITECTURE.md

A technical explanation of how the app actually works, written for someone who wants to
understand the system without reading every file.

Should cover:
- Data model with the reasoning behind each relationship, especially why progression is
  scoped to exercise + gym + equipment rather than exercise alone
- Why templates store structure and never weights, and how pre-fill resolves from history
- The top-set selection function and everything that depends on it
- Warm-up inference and its edge cases
- Local persistence: schema, migrations, transaction boundaries, and why writes happen
  per-set rather than at session end
- State management for an in-progress workout, including crash recovery
- Screen structure and navigation
- Known limitations and what was deliberately deferred, with reasons

Keep both documents accurate as the code changes. A stale architecture doc is worse than
none.