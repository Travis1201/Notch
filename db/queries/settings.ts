import type { Database } from '../client';

// Asserts the row exists — safe post-bootstrap (see db/bootstrap.ts, run once at boot
// before any screen renders).
export async function getSettings(db: Database) {
  const row = await db.query.settings.findFirst();
  if (!row) throw new Error('settings row missing — bootstrap did not run');
  return row;
}
