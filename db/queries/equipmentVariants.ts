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
