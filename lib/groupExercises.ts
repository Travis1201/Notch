import type { Exercise } from '../db/types';

export interface ExerciseSection {
  title: string;
  data: Exercise[];
}

// Shared by the Exercises tab and the mid-workout Add Exercise sheet — both need the
// same "browsable, not search-only" grouped view (CLAUDE.md "Mid-workout
// flexibility"). Alphabetical by muscle group so it reads consistently regardless of
// insertion order.
export function groupByMuscleGroup(exerciseList: Exercise[]): ExerciseSection[] {
  const byGroup = new Map<string, Exercise[]>();
  for (const exercise of exerciseList) {
    const list = byGroup.get(exercise.muscleGroup);
    if (list) list.push(exercise);
    else byGroup.set(exercise.muscleGroup, [exercise]);
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, data]) => ({ title, data }));
}
