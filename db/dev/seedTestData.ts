import type { Database } from '../client';
import { exercises, sets, sessions } from '../schema';
import { listExercises } from '../queries/exercises';
import { getDefaultGym } from '../queries/gyms';
import { findOrCreateEquipmentVariant } from '../queries/equipmentVariants';

// Dev-only fixture data so the logging screen's pre-fill / green-arrow / warm-up
// greying can be exercised without a week of real gym use. Never referenced outside
// `if (__DEV__)` — Metro dead-code-eliminates the whole branch in release builds, so
// nothing ships. CLAUDE.md "Empty states" forbids seeding data for real users; this
// exists purely because there's no simulator in this dev environment to test against.
//
// Idempotent: skips entirely if any exercise already exists. Before the seed exercise
// list (build order step 3) ships, a fresh install's exercises table is otherwise
// always empty, so this is a safe, simple sentinel for "already seeded."
export async function seedTestData(db: Database): Promise<void> {
  const existing = await listExercises(db);
  if (existing.length > 0) return;

  const gym = await getDefaultGym(db);
  if (!gym) return;

  const [chestPress] = await db
    .insert(exercises)
    .values({ name: 'Chest press', muscleGroup: 'Chest', equipmentType: 'machine', isCustom: false })
    .returning();
  const [backSquat] = await db
    .insert(exercises)
    .values({ name: 'Back squat', muscleGroup: 'Legs', equipmentType: 'barbell', isCustom: false })
    .returning();

  const chestVariant = await findOrCreateEquipmentVariant(db, {
    exerciseId: chestPress.id,
    gymId: gym.id,
    brand: null,
  });
  const squatVariant = await findOrCreateEquipmentVariant(db, {
    exerciseId: backSquat.id,
    gymId: gym.id,
    brand: null,
  });

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  async function seedPastSession(
    date: Date,
    entries: { equipmentVariantId: string; weight: number; reps: number; rir: number }[],
  ) {
    const [session] = await db
      .insert(sessions)
      .values({ date, gymId: gym!.id, templateId: null, status: 'complete', durationSeconds: 2400 })
      .returning();
    let position = 0;
    for (const entry of entries) {
      const loggedAt = new Date(date.getTime() + position * 3 * 60 * 1000);
      await db.insert(sets).values({
        sessionId: session.id,
        equipmentVariantId: entry.equipmentVariantId,
        weight: entry.weight,
        reps: entry.reps,
        rir: entry.rir,
        position,
        loggedAt,
        isWarmupOverride: null,
      });
      position += 1;
    }
  }

  await seedPastSession(daysAgo(14), [
    { equipmentVariantId: chestVariant.id, weight: 135, reps: 8, rir: 4 },
    { equipmentVariantId: chestVariant.id, weight: 185, reps: 6, rir: 2 },
    { equipmentVariantId: chestVariant.id, weight: 215, reps: 7, rir: 1 },
    { equipmentVariantId: squatVariant.id, weight: 135, reps: 8, rir: 4 },
    { equipmentVariantId: squatVariant.id, weight: 225, reps: 6, rir: 1 },
  ]);

  await seedPastSession(daysAgo(7), [
    { equipmentVariantId: chestVariant.id, weight: 135, reps: 8, rir: 4 },
    { equipmentVariantId: chestVariant.id, weight: 185, reps: 6, rir: 2 },
    { equipmentVariantId: chestVariant.id, weight: 225, reps: 7, rir: 1 },
    { equipmentVariantId: squatVariant.id, weight: 135, reps: 8, rir: 4 },
    { equipmentVariantId: squatVariant.id, weight: 235, reps: 5, rir: 1 },
  ]);
}
