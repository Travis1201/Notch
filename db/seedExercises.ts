import type { ExerciseEquipmentType } from './schema';

// CLAUDE.md "Seed exercise list": ship ~60 common movements so a new user isn't
// creating everything by hand. Generic names ("Chest press," never "Hammer Strength
// chest press") — equipment brand is a separate attribute resolved per gym (step 4).
// restSeconds/weightIncrement/repFloor are intentionally omitted here: every seeded
// exercise starts on the global settings default (null) until a user overrides it.
export interface SeedExercise {
  name: string;
  muscleGroup: string;
  equipmentType: ExerciseEquipmentType;
}

export const SEED_EXERCISES: SeedExercise[] = [
  // Barbell (12)
  { name: 'Back squat', muscleGroup: 'Legs', equipmentType: 'barbell' },
  { name: 'Front squat', muscleGroup: 'Legs', equipmentType: 'barbell' },
  { name: 'Deadlift', muscleGroup: 'Back', equipmentType: 'barbell' },
  { name: 'Romanian deadlift', muscleGroup: 'Legs', equipmentType: 'barbell' },
  { name: 'Bench press', muscleGroup: 'Chest', equipmentType: 'barbell' },
  { name: 'Incline bench press', muscleGroup: 'Chest', equipmentType: 'barbell' },
  { name: 'Overhead press', muscleGroup: 'Shoulders', equipmentType: 'barbell' },
  { name: 'Barbell row', muscleGroup: 'Back', equipmentType: 'barbell' },
  { name: 'Barbell curl', muscleGroup: 'Biceps', equipmentType: 'barbell' },
  { name: 'Close-grip bench press', muscleGroup: 'Triceps', equipmentType: 'barbell' },
  { name: 'Hip thrust', muscleGroup: 'Legs', equipmentType: 'barbell' },
  { name: 'Barbell lunge', muscleGroup: 'Legs', equipmentType: 'barbell' },

  // Dumbbell (12)
  { name: 'Dumbbell bench press', muscleGroup: 'Chest', equipmentType: 'dumbbell' },
  { name: 'Incline dumbbell press', muscleGroup: 'Chest', equipmentType: 'dumbbell' },
  { name: 'Dumbbell shoulder press', muscleGroup: 'Shoulders', equipmentType: 'dumbbell' },
  { name: 'Dumbbell row', muscleGroup: 'Back', equipmentType: 'dumbbell' },
  { name: 'Dumbbell curl', muscleGroup: 'Biceps', equipmentType: 'dumbbell' },
  { name: 'Hammer curl', muscleGroup: 'Biceps', equipmentType: 'dumbbell' },
  { name: 'Dumbbell lateral raise', muscleGroup: 'Shoulders', equipmentType: 'dumbbell' },
  { name: 'Dumbbell fly', muscleGroup: 'Chest', equipmentType: 'dumbbell' },
  { name: 'Dumbbell shrug', muscleGroup: 'Back', equipmentType: 'dumbbell' },
  { name: 'Dumbbell Romanian deadlift', muscleGroup: 'Legs', equipmentType: 'dumbbell' },
  { name: 'Dumbbell walking lunge', muscleGroup: 'Legs', equipmentType: 'dumbbell' },
  { name: 'Dumbbell triceps extension', muscleGroup: 'Triceps', equipmentType: 'dumbbell' },

  // Machine (14)
  { name: 'Chest press', muscleGroup: 'Chest', equipmentType: 'machine' },
  { name: 'Shoulder press machine', muscleGroup: 'Shoulders', equipmentType: 'machine' },
  { name: 'Leg press', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Leg extension', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Leg curl', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Seated row machine', muscleGroup: 'Back', equipmentType: 'machine' },
  { name: 'Pec deck', muscleGroup: 'Chest', equipmentType: 'machine' },
  { name: 'Hip abductor machine', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Hip adductor machine', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Calf raise machine', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Back extension machine', muscleGroup: 'Back', equipmentType: 'machine' },
  { name: 'Ab crunch machine', muscleGroup: 'Core', equipmentType: 'machine' },
  { name: 'Smith machine squat', muscleGroup: 'Legs', equipmentType: 'machine' },
  { name: 'Preacher curl machine', muscleGroup: 'Biceps', equipmentType: 'machine' },

  // Cable (12)
  { name: 'Lat pulldown', muscleGroup: 'Back', equipmentType: 'cable' },
  { name: 'Cable row', muscleGroup: 'Back', equipmentType: 'cable' },
  { name: 'Cable fly', muscleGroup: 'Chest', equipmentType: 'cable' },
  { name: 'Cable crossover', muscleGroup: 'Chest', equipmentType: 'cable' },
  { name: 'Triceps pushdown', muscleGroup: 'Triceps', equipmentType: 'cable' },
  { name: 'Cable curl', muscleGroup: 'Biceps', equipmentType: 'cable' },
  { name: 'Cable lateral raise', muscleGroup: 'Shoulders', equipmentType: 'cable' },
  { name: 'Face pull', muscleGroup: 'Shoulders', equipmentType: 'cable' },
  { name: 'Cable woodchopper', muscleGroup: 'Core', equipmentType: 'cable' },
  { name: 'Straight-arm pulldown', muscleGroup: 'Back', equipmentType: 'cable' },
  { name: 'Cable kickback', muscleGroup: 'Legs', equipmentType: 'cable' },
  { name: 'Cable pull-through', muscleGroup: 'Legs', equipmentType: 'cable' },

  // Bodyweight (10)
  { name: 'Pull-up', muscleGroup: 'Back', equipmentType: 'bodyweight' },
  { name: 'Chin-up', muscleGroup: 'Back', equipmentType: 'bodyweight' },
  { name: 'Push-up', muscleGroup: 'Chest', equipmentType: 'bodyweight' },
  { name: 'Dip', muscleGroup: 'Triceps', equipmentType: 'bodyweight' },
  { name: 'Bodyweight squat', muscleGroup: 'Legs', equipmentType: 'bodyweight' },
  { name: 'Lunge', muscleGroup: 'Legs', equipmentType: 'bodyweight' },
  { name: 'Plank', muscleGroup: 'Core', equipmentType: 'bodyweight' },
  { name: 'Hanging leg raise', muscleGroup: 'Core', equipmentType: 'bodyweight' },
  { name: 'Glute bridge', muscleGroup: 'Legs', equipmentType: 'bodyweight' },
  { name: 'Inverted row', muscleGroup: 'Back', equipmentType: 'bodyweight' },
];
