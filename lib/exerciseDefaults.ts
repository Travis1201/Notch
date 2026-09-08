// The "per-exercise override falls back to the settings default" pattern, needed
// identically for rest seconds, weight increment, and rep floor — see db/schema.ts,
// `exercises.restSeconds`/`weightIncrement`/`repFloor` and their comment.
interface ExerciseOverrides {
  restSeconds: number | null;
  weightIncrement: number | null;
  repFloor: number | null;
}

interface SettingsDefaults {
  defaultRestSeconds: number;
  defaultWeightIncrement: number;
  defaultRepFloor: number;
}

export function resolveRestSeconds(
  exercise: Pick<ExerciseOverrides, 'restSeconds'>,
  settings: Pick<SettingsDefaults, 'defaultRestSeconds'>,
): number {
  return exercise.restSeconds ?? settings.defaultRestSeconds;
}

export function resolveWeightIncrement(
  exercise: Pick<ExerciseOverrides, 'weightIncrement'>,
  settings: Pick<SettingsDefaults, 'defaultWeightIncrement'>,
): number {
  return exercise.weightIncrement ?? settings.defaultWeightIncrement;
}

export function resolveRepFloor(
  exercise: Pick<ExerciseOverrides, 'repFloor'>,
  settings: Pick<SettingsDefaults, 'defaultRepFloor'>,
): number {
  return exercise.repFloor ?? settings.defaultRepFloor;
}
