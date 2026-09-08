import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

import { randomUUID } from './uuid';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const gyms = sqliteTable('gyms', {
  id: id(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
});

export const exerciseEquipmentTypes = [
  'machine',
  'barbell',
  'dumbbell',
  'cable',
  'bodyweight',
] as const;
export type ExerciseEquipmentType = (typeof exerciseEquipmentTypes)[number];

export const exercises = sqliteTable('exercises', {
  id: id(),
  name: text('name').notNull(),
  muscleGroup: text('muscle_group').notNull(),
  equipmentType: text('equipment_type', { enum: exerciseEquipmentTypes }).notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  // Nullable overrides — fall back to the single-row settings table when unset.
  restSeconds: integer('rest_seconds'),
  weightIncrement: real('weight_increment'),
  repFloor: integer('rep_floor'),
});

// The unit progression is actually tracked against: exercise + gym + brand.
// Created implicitly the first time a user logs that combination.
export const equipmentVariants = sqliteTable(
  'equipment_variants',
  {
    id: id(),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    gymId: text('gym_id')
      .notNull()
      .references(() => gyms.id),
    brand: text('brand'),
  },
  (table) => [index('equipment_variants_exercise_gym_idx').on(table.exerciseId, table.gymId)],
);

// Stores structure only — an ordered list of exercises. Never weights, reps, or RIR.
export const templates = sqliteTable('templates', {
  id: id(),
  name: text('name').notNull(),
});

export const templateExercises = sqliteTable(
  'template_exercises',
  {
    id: id(),
    templateId: text('template_id')
      .notNull()
      .references(() => templates.id),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
  },
  (table) => [index('template_exercises_template_idx').on(table.templateId)],
);

export const sessionStatuses = ['in_progress', 'complete'] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export const sessions = sqliteTable('sessions', {
  id: id(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  gymId: text('gym_id')
    .notNull()
    .references(() => gyms.id),
  templateId: text('template_id').references(() => templates.id),
  status: text('status', { enum: sessionStatuses }).notNull().default('in_progress'),
  currentPosition: integer('current_position').notNull().default(0),
  // Calculated once at finalization (last set timestamp minus first set timestamp),
  // then stored. Never derived from wall-clock close time — see CLAUDE.md "Duration".
  durationSeconds: integer('duration_seconds'),
});

// A set logged before the top set, at a lower weight, in the same exercise is inferred
// as a warm-up at read time. is_warmup_override lets the user flip that inference.
export const sets = sqliteTable(
  'sets',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    equipmentVariantId: text('equipment_variant_id')
      .notNull()
      .references(() => equipmentVariants.id),
    weight: real('weight').notNull(), // stored in lb, always
    reps: integer('reps').notNull(),
    rir: integer('rir').notNull(),
    position: integer('position').notNull(),
    loggedAt: integer('logged_at', { mode: 'timestamp' }).notNull(),
    // null = use warm-up inference; true/false = explicit user override.
    isWarmupOverride: integer('is_warmup_override', { mode: 'boolean' }),
    // Present from v1 so bodyweight/assisted movements (v2) don't need a migration.
    addedWeight: real('added_weight'),
    assistanceWeight: real('assistance_weight'),
  },
  (table) => [
    index('sets_session_idx').on(table.sessionId),
    index('sets_equipment_variant_idx').on(table.equipmentVariantId),
  ],
);

export const unitPreferences = ['lb', 'kg'] as const;
export type UnitPreference = (typeof unitPreferences)[number];

// Single-row table: one settings record for the whole app.
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  unitPreference: text('unit_preference', { enum: unitPreferences }).notNull().default('lb'),
  defaultRestSeconds: integer('default_rest_seconds').notNull().default(150),
  defaultWeightIncrement: real('default_weight_increment').notNull().default(2.5),
  defaultRepFloor: integer('default_rep_floor').notNull().default(1),
});

export const goals = sqliteTable('goals', {
  id: id(),
  equipmentVariantId: text('equipment_variant_id')
    .notNull()
    .references(() => equipmentVariants.id),
  targetWeight: real('target_weight').notNull(),
  targetReps: integer('target_reps').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  achievedAt: integer('achieved_at', { mode: 'timestamp' }),
});
