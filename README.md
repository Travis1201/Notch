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

v1 core feature set — logging, templates, history, and progress tracking — is built. Development is now moving into v2, which will add drop sets and goal-setting with projected timelines. Targeting TestFlight for initial testing, with an eventual App Store release.

## Screenshots

*(coming soon)*
