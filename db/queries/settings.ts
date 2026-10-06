import { eq } from 'drizzle-orm';

import type { Database } from '../client';
import { settings } from '../schema';
import type { Settings } from '../types';

// Asserts the row exists — safe post-bootstrap (see db/bootstrap.ts, run once at boot
// before any screen renders).
export async function getSettings(db: Database) {
  const row = await db.query.settings.findFirst();
  if (!row) throw new Error('settings row missing — bootstrap did not run');
  return row;
}

// Patches the single settings row (id 1 — see db/schema.ts). `id` is excluded from the
// patch type rather than merely ignored: a caller spreading an existing Settings object
// in here must not be able to repoint which row is "the" settings row.
export type SettingsPatch = Partial<Omit<Settings, 'id'>>;

export async function updateSettings(db: Database, patch: SettingsPatch): Promise<Settings> {
  const [row] = await db.update(settings).set(patch).where(eq(settings.id, 1)).returning();
  if (!row) throw new Error('settings row missing — bootstrap did not run');
  return row;
}
