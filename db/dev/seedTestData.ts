import type { Database } from '../client';
import { sets, sessions } from '../schema';
import { getDefaultGym } from '../queries/gyms';
import { findOrCreateEquipmentVariant } from '../queries/equipmentVariants';

// Dev-only fixture data so the logging screen's pre-fill / green-arrow / warm-up
// greying can be exercised without a week of real gym use. Never referenced outside
// `if (__DEV__)` — Metro dead-code-eliminates the whole branch in release builds, so
// nothing ships. CLAUDE.md "Empty states" forbids seeding data for real users; this
// exists purely because there's no simulator in this dev environment to test against.
//
// Idempotent on "does any session already exist" — NOT "does any exercise exist,"
// since the real seed list (db/seedExercises.ts, wired into db/bootstrap.ts) now
// always populates ~60 exercises for every install, including "Chest press" and
// "Back squat" by name. This looks those up rather than inserting duplicates.
export async function seedTestData(db: Database): Promise<void> {
  const existingSession = await db.query.sessions.findFirst();
  if (existingSession) return;

  const gym = await getDefaultGym(db);
  if (!gym) return;

  const chestPress = await db.query.exercises.findFirst({
    where: (e, { eq }) => eq(e.name, 'Chest press'),
  });
  const backSquat = await db.query.exercises.findFirst({
    where: (e, { eq }) => eq(e.name, 'Back squat'),
  });
  if (!chestPress || !backSquat) return; // seed list didn't run yet or was edited

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
