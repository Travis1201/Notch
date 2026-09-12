// Canonical muscle-group taxonomy, matching notch-seed-exercises.csv exactly. Used
// as the combobox source in ExerciseForm so a custom exercise groups into the same
// Exercises-tab section as the seed list instead of splintering off ("Legs" vs
// "legs" vs "Leg") into its own one-item section.
export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Traps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Abs',
  'Forearms',
] as const;
