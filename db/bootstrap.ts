import type { Database } from './client';
import { settings, gyms, exercises } from './schema';
import { SEED_EXERCISES } from './seedExercises';

// The settings migration only defines column DEFAULTS for future inserts — nothing
// actually inserts row id=1. Idempotent: safe to call on every boot.
export async function ensureSettingsRow(db: Database) {
  const existing = await db.query.settings.findFirst();
  if (existing) return existing;
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const row = await db.query.settings.findFirst();
  if (!row) throw new Error('Failed to bootstrap settings row');
  return row;
}

// CLAUDE.md "Multi-gym": "One gym is created on first launch and auto-selected
// forever." Idempotent: safe to call on every boot.
export async function ensureDefaultGym(db: Database) {
  const existing = await db.query.gyms.findFirst({ where: (g, { eq }) => eq(g.isDefault, true) });
  if (existing) return existing;
  const [row] = await db.insert(gyms).values({ name: 'Home Gym', isDefault: true }).returning();
  return row;
}

// CLAUDE.md "Seed exercise list": ship ~60 real exercises so a new user isn't
// creating everything by hand. Sentinel is "does any seeded (isCustom=false) row
// exist" rather than "does any exercise exist" — more precise, and can't be
// short-circuited by a user's own custom exercise. Not __DEV__-gated: this runs for
// every real user, unlike db/dev/seedTestData.ts's fake workout history.
export async function ensureSeedExercises(db: Database) {
  const existing = await db.query.exercises.findFirst({
    where: (e, { eq }) => eq(e.isCustom, false),
  });
  if (existing) return;
  await db.insert(exercises).values(SEED_EXERCISES.map((e) => ({ ...e, isCustom: false })));
}

export async function runBootstrap(db: Database): Promise<void> {
  await ensureSettingsRow(db);
  await ensureDefaultGym(db);
  await ensureSeedExercises(db);
}
