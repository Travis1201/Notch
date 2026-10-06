import type { Database } from '../client';
import journal from '../migrations/meta/_journal.json';
import type { ExportTables } from '../../lib/exportData';

// The schema version that travels in an export file (CLAUDE.md "Backup and export":
// "Include schema version in the export").
//
// Read from the bundled Drizzle journal rather than hand-maintained, because a
// hand-maintained constant is one someone forgets to bump in the same commit that adds a
// migration — and a version number that's silently wrong is worse than none, since an
// importer would trust it. `migrate()` applies exactly these entries in order, so the
// last tag is by definition the schema the running app is on.
export const SCHEMA_VERSION: string = journal.entries[journal.entries.length - 1].tag;

// Reads every table for export.
//
// Wrapped in a transaction for a consistent SNAPSHOT, not for write safety: the rest
// timer, an auto-close sweep, or a set logged from a session left open in another tab of
// the navigation stack can all write while this runs. Ten separate reads outside a
// transaction could capture a `sets` row whose parent `sessions` row it had already read
// past — producing a file that fails referential integrity on import for no reason other
// than timing. Cheap insurance on a read this infrequent.
export async function readAllTablesForExport(db: Database): Promise<ExportTables> {
  return db.transaction(async (tx) => ({
    gyms: await tx.query.gyms.findMany(),
    exercises: await tx.query.exercises.findMany(),
    equipmentVariants: await tx.query.equipmentVariants.findMany(),
    templates: await tx.query.templates.findMany(),
    templateExercises: await tx.query.templateExercises.findMany(),
    sessions: await tx.query.sessions.findMany(),
    sessionExercises: await tx.query.sessionExercises.findMany(),
    sets: await tx.query.sets.findMany(),
    settings: await tx.query.settings.findMany(),
    goals: await tx.query.goals.findMany(),
  }));
}
