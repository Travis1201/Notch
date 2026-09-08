import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'notch.db';

export type Database = ExpoSQLiteDatabase<typeof schema>;

let dbPromise: Promise<{ db: Database; connection: SQLiteDatabase }> | null = null;

// Opens the database with the async API (never openDatabaseSync — see CLAUDE.md
// "expo-sqlite + Drizzle" gotcha) and memoizes the connection for the app's lifetime.
export function openDb() {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DATABASE_NAME).then((connection) => ({
      connection,
      db: drizzle(connection, { schema }),
    }));
  }
  return dbPromise;
}
