import type { Database } from '../client';
import {
  gyms,
  exercises,
  equipmentVariants,
  templates,
  templateExercises,
  sessions,
  sessionExercises,
  sets,
  settings,
  goals,
} from '../schema';
import { runBootstrap } from '../bootstrap';

// Dev-only escape hatch. ensureSeedExercises (bootstrap.ts) only ever inserts the
// seed list once — "does any non-custom exercise exist" — so an install from before
// a seed-list change (e.g. switching to notch-seed-exercises.csv) is stuck on
// whatever it originally got. There's no simulator in this dev environment to test
// against, and clearing Expo Go's storage isn't a reliable way to reset just this
// project's SQLite file, so this wipes every table (children before parents, for FK
// safety) and re-runs the normal bootstrap — settings row, default gym, current seed
// list — from scratch. Same rationale as db/dev/seedTestData.ts: __DEV__-gated only,
// dead-code-eliminated from release builds, never touches real user data because
// there is none yet.
export async function resetDatabase(db: Database): Promise<void> {
  await db.delete(sets);
  await db.delete(goals);
  await db.delete(sessionExercises);
  await db.delete(sessions);
  await db.delete(equipmentVariants);
  await db.delete(templateExercises);
  await db.delete(templates);
  await db.delete(exercises);
  await db.delete(gyms);
  await db.delete(settings);
  await runBootstrap(db);
}
