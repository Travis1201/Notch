import type { Database } from './client';
import { settings, gyms } from './schema';

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

export async function runBootstrap(db: Database): Promise<void> {
  await ensureSettingsRow(db);
  await ensureDefaultGym(db);
}
