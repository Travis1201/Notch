import type {
  EquipmentVariant,
  Exercise,
  Goal,
  Gym,
  Session,
  SessionExercise,
  Set,
  Settings,
  Template,
  TemplateExercise,
} from '../db/types';

// CLAUDE.md "Backup and export": v1, not nice-to-have. There is no server, so a lost or
// reinstalled phone is a lost training history, and this is the only thing standing
// between a tester and that.
//
// Pure: builds the payload from rows handed to it and touches neither the database nor
// any Expo module, so the format is verifiable without a device. Reading the rows is
// db/queries/export.ts's job and handing the file to the share sheet is the screen's.

// Bumped only when the SHAPE of this file changes in a way an importer would need to
// branch on. Distinct from `schemaVersion` below: the migration tag says what the
// database looked like, this says what the envelope around it looks like.
export const EXPORT_FORMAT_VERSION = 1 as const;

// Every table, verbatim, including primary keys and foreign keys.
//
// IDs are kept deliberately. CLAUDE.md requires the format be designed so that import
// is possible later (v2) and the schema be kept sync-friendly with stable IDs — an
// export that dropped them would force an importer to re-derive every relationship by
// matching on names, which is exactly the guesswork that scoping progression to
// exercise + gym + brand exists to avoid.
export interface ExportTables {
  gyms: Gym[];
  exercises: Exercise[];
  equipmentVariants: EquipmentVariant[];
  templates: Template[];
  templateExercises: TemplateExercise[];
  sessions: Session[];
  sessionExercises: SessionExercise[];
  sets: Set[];
  settings: Settings[];
  goals: Goal[];
}

export interface ExportPayload {
  // Lets an importer reject a file from some other app before parsing anything else.
  app: 'notch';
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  // The latest applied Drizzle migration tag (e.g. "0003_curious_dark_beast"). CLAUDE.md
  // "Include schema version in the export" — without it, a future importer can't tell
  // whether a file predates a column it now expects.
  schemaVersion: string;
  exportedAt: string; // ISO 8601
  // Stated rather than implied: every weight in this file is POUNDS, whatever the user's
  // display preference is (CLAUDE.md "Units" — lb is the storage unit, conversion happens
  // at the UI boundary). `settings.unitPreference` travels in the data as a display
  // preference and must never be read as a unit for these numbers.
  weightUnit: 'lb';
  data: ExportTables;
}

export interface ExportMeta {
  schemaVersion: string;
  exportedAt: Date;
}

export function buildExportPayload(tables: ExportTables, meta: ExportMeta): ExportPayload {
  return {
    app: 'notch',
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: meta.schemaVersion,
    exportedAt: meta.exportedAt.toISOString(),
    weightUnit: 'lb',
    data: tables,
  };
}

// Pretty-printed, not minified. The file is small (a year of hard training is a few
// hundred KB) and a human being may well end up opening it in a text editor to check
// their data is really in there — which is the whole reassurance the feature exists to
// provide. `Date` columns serialize to ISO 8601 strings via Date.prototype.toJSON.
export function serializeExport(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

// Sortable date prefix, and a name that says what it is in a share sheet full of other
// files. Local date rather than UTC: a workout exported at 11pm belongs to that day as
// the user experienced it.
export function exportFileName(exportedAt: Date): string {
  const year = exportedAt.getFullYear();
  const month = String(exportedAt.getMonth() + 1).padStart(2, '0');
  const day = String(exportedAt.getDate()).padStart(2, '0');
  return `notch-export-${year}-${month}-${day}.json`;
}

// Shown on the settings row so the button isn't an unlabelled promise — a user deciding
// whether their backup actually worked wants to see a count, not a spinner that ended.
export function summarizeExport(tables: ExportTables): string {
  const sessionCount = tables.sessions.length;
  const setCount = tables.sets.length;
  const sessionLabel = sessionCount === 1 ? 'session' : 'sessions';
  const setLabel = setCount === 1 ? 'set' : 'sets';
  return `${sessionCount} ${sessionLabel}, ${setCount} ${setLabel}`;
}
