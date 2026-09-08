import type { Database } from '../client';

export async function getDefaultGym(db: Database) {
  const gym = await db.query.gyms.findFirst({ where: (g, { eq }) => eq(g.isDefault, true) });
  return gym ?? null;
}
