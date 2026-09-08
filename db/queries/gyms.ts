import type { Database } from '../client';
import { gyms } from '../schema';

export async function getDefaultGym(db: Database) {
  const gym = await db.query.gyms.findFirst({ where: (g, { eq }) => eq(g.isDefault, true) });
  return gym ?? null;
}

export async function listGyms(db: Database) {
  return db.query.gyms.findMany({ orderBy: (g, { asc }) => asc(g.name) });
}

export async function createGym(db: Database, input: { name: string }) {
  const [row] = await db.insert(gyms).values({ name: input.name, isDefault: false }).returning();
  return row;
}

// CLAUDE.md "Core design principle: confirm, don't input" — "Gym defaults to the
// last one used; most users never touch the switcher." Derived from the most recent
// session's gym, not a separately stored preference — falls back to the bootstrap
// default gym only when no session has ever been logged yet.
export async function getLastUsedGym(db: Database) {
  const lastSession = await db.query.sessions.findFirst({
    orderBy: (s, { desc }) => desc(s.date),
  });
  if (lastSession) {
    const gym = await db.query.gyms.findFirst({ where: (g, { eq }) => eq(g.id, lastSession.gymId) });
    if (gym) return gym;
  }
  return getDefaultGym(db);
}
