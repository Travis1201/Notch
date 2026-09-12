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

// CLAUDE.md "Seed exercise list": ship real exercises so a new user isn't creating
// everything by hand. Not __DEV__-gated: this runs for every real user, unlike
// db/dev/seedTestData.ts's fake workout history.
//
// Additive by NAME, not a single "have we ever seeded?" flag. The original version
// bailed out the moment any isCustom=false row existed, which meant every install
// created before a seed-list change was permanently stuck on the old list — the only
// way to pick up new movements was the dev "Reset app data" button, i.e. wiping all
// training history. Diffing on name means growing the list reaches existing installs
// on the next launch, and the name comparison is case-insensitive so a user who hand-
// created "preacher curl" before it shipped doesn't end up with two of them.
//
// Deliberately only ever INSERTS. It never updates or deletes an existing row: a user
// may have edited a seeded exercise's muscle group or rest/increment overrides, and
// re-running this on every launch must not quietly revert their edits.
//
// Inserted in chunks, and in one transaction, rather than as a single statement: the
// seed list is 200+ rows and each row binds a parameter per column, which puts a
// single multi-row INSERT within range of SQLite's SQLITE_MAX_VARIABLE_NUMBER (999
// on older builds) — a limit that would only ever be hit on a fresh install, i.e. by
// every new user and by nobody testing an upgrade. The transaction keeps a partial
// library from surviving a failure midway through (CLAUDE.md Gotchas: "Wrap multi-row
// writes in transactions").
const SEED_INSERT_CHUNK_SIZE = 50;

export async function ensureSeedExercises(db: Database) {
  const existing = await db.query.exercises.findMany({ columns: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  const missing = SEED_EXERCISES.filter((e) => !existingNames.has(e.name.trim().toLowerCase()));
  if (missing.length === 0) return;

  await db.transaction(async (tx) => {
    for (let i = 0; i < missing.length; i += SEED_INSERT_CHUNK_SIZE) {
      const chunk = missing.slice(i, i + SEED_INSERT_CHUNK_SIZE);
      await tx.insert(exercises).values(chunk.map((e) => ({ ...e, isCustom: false })));
    }
  });
}

export async function runBootstrap(db: Database): Promise<void> {
  await ensureSettingsRow(db);
  await ensureDefaultGym(db);
  await ensureSeedExercises(db);
}
