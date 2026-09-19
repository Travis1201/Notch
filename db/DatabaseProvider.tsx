import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { colors } from '../constants/theme';
import { openDb, type Database } from './client';
import { runBootstrap } from './bootstrap';
import migrations from './migrations/migrations';

const DatabaseContext = createContext<Database | null>(null);

export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (!db) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return db;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    openDb()
      .then(async ({ db: openedDb }) => {
        await migrate(openedDb, migrations);
        await runBootstrap(openedDb);
        if (!cancelled) setDb(openedDb);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <ScrollView contentContainerStyle={styles.center}>
        <Text style={styles.errorTitle}>Database failed to load</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        {error.stack ? <Text style={styles.errorStack}>{error.stack}</Text> : null}
      </ScrollView>
    );
  }

  if (!db) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    color: colors.textPrimary,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorStack: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 16,
    fontFamily: 'monospace',
  },
});
