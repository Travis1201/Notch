import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '../client';
import { equipmentVariants } from '../schema';

// Select-then-insert inside a transaction. The existing index on
// (exerciseId, gymId) isn't unique, and a unique index wouldn't help anyway — SQLite
// never treats two NULL brands as equal — so this transaction is the only thing
// preventing a double-tap from creating duplicate variant rows.
export async function findOrCreateEquipmentVariant(
  db: Database,
  input: { exerciseId: string; gymId: string; brand?: string | null },
) {
  const brand = input.brand ?? null;
  return db.transaction(async (tx) => {
    const existing = await tx.query.equipmentVariants.findFirst({
      where: and(
        eq(equipmentVariants.exerciseId, input.exerciseId),
        eq(equipmentVariants.gymId, input.gymId),
        brand === null ? isNull(equipmentVariants.brand) : eq(equipmentVariants.brand, brand),
      ),
    });
    if (existing) return existing;

    const [row] = await tx
      .insert(equipmentVariants)
      .values({ exerciseId: input.exerciseId, gymId: input.gymId, brand })
      .returning();
    return row;
  });
}

export async function getEquipmentVariant(db: Database, id: string) {
  const row = await db.query.equipmentVariants.findFirst({ where: (v, { eq }) => eq(v.id, id) });
  return row ?? null;
}

// CLAUDE.md v1 scope: equipment brand combobox "remembers per exercise+gym." A gym
// can have swapped equipment over time, so more than one variant can exist for the
// same (exerciseId, gymId) with different brands — this returns whichever one was
// used most recently (by its most recent set), not just the first one found. Read-
// only — unlike findOrCreateEquipmentVariant, never inserts a row, so it's safe to
// call from a passive display context (e.g. the home screen hero card) for an
// exercise that's never actually been logged at this gym, which just returns null.
export async function getLastUsedVariant(db: Database, exerciseId: string, gymId: string) {
  const variants = await db.query.equipmentVariants.findMany({
    where: and(eq(equipmentVariants.exerciseId, exerciseId), eq(equipmentVariants.gymId, gymId)),
  });
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const variantIds = variants.map((v) => v.id);
  const recentSet = await db.query.sets.findFirst({
    where: (s, { inArray: inArr }) => inArr(s.equipmentVariantId, variantIds),
    orderBy: (s, { desc }) => desc(s.loggedAt),
  });
  if (!recentSet) return variants[0];
  return variants.find((v) => v.id === recentSet.equipmentVariantId) ?? variants[0];
}

export async function getLastUsedBrand(
  db: Database,
  exerciseId: string,
  gymId: string,
): Promise<string | null> {
  const variant = await getLastUsedVariant(db, exerciseId, gymId);
  return variant?.brand ?? null;
}
