# Notch

**Progressive overload tracker for experienced lifters.**

Notch is an offline-first workout logging app built for lifters who already know what they're doing and just want a fast, precise way to track it. No accounts, no analytics, no data ever leaves your phone.

## Why Notch

Most lifting apps are built for beginners — recommended programs, generic templates, vague progress metrics. Notch skips all of that. You build your own templates, log your own numbers, and Notch's only job is to make that logging fast and to tell you, unambiguously, whether you're progressing.

- **No data collection.** Fully local storage, no backend, no accounts.
- **Real progression tracking.** A goal is only met when you match or beat both the weight *and* the reps of your target — not an estimated 1RM, not a calculated score. Just the number you can actually put on the bar and see.
- **Equipment-specific logging.** A Technogym pec dec and a Hammer Strength pec dec are different exercises with different numbers. Notch tracks them separately.
- **Built for the gym floor, not the couch.** The active workout screen shows every exercise at once, scrollable, with sets editable in any order — no forced single-exercise stepper getting in your way mid-session.
- **RIR logging.** Reps-in-reserve tracking for lifters who train with intent, not just volume.

## Tech stack

- **React Native + Expo** — cross-platform, no Mac required for development
- **expo-router** — file-based navigation
- **Drizzle ORM + SQLite** — local, structured, fully offline data storage
- **Zustand** — app state management
- **TypeScript** (strict mode)

## Status

The v1 feature set is built: active workout logging with pre-fill from your last session, templates, the exercise library, multi-gym and equipment-brand tracking, warm-up inference, top-set progression charts, editable history, settings, and JSON export of everything to the share sheet.

Export matters more here than in most apps — there's no account and no cloud backup, so it's the only thing between a reinstall and losing your training history. Importing a file back is a v2 item, so keep the files you export.

The colour palette is mid-test — see `UI-changes.md`. Not everything above has been used on a phone yet; `ARCHITECTURE.md` is specific about which parts have.

After that, v2 is goals with projected timelines, bodyweight and assisted movements, and cross-gym reference display. Drop sets, supersets, and myo-reps are deliberately out of scope — log them as ordinary sets.

Targeting TestFlight for initial testing, with an eventual App Store release.

## Screenshots

*(coming soon)*
