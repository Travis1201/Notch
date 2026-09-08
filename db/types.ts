import type {
  gyms,
  exercises,
  equipmentVariants,
  templates,
  templateExercises,
  sessions,
  sessionExercises,
  sets,
  settings,
  goals,
} from './schema';

export type Gym = typeof gyms.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type EquipmentVariant = typeof equipmentVariants.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type TemplateExercise = typeof templateExercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type Set = typeof sets.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Goal = typeof goals.$inferSelect;
