import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors, numeric, radii, text } from '../constants/theme';
import { useDatabase } from '../db/DatabaseProvider';
import { getSettings, updateSettings, type SettingsPatch } from '../db/queries/settings';
import { readAllTablesForExport, SCHEMA_VERSION } from '../db/queries/export';
import { unitPreferences, type UnitPreference } from '../db/schema';
import type { Settings } from '../db/types';
import { NumberStepper } from '../components/session/NumberStepper';
import { buildExportPayload, summarizeExport } from '../lib/exportData';
import { shareExportPayload } from '../lib/shareExport';
import { fromLb, toLb } from '../lib/units';

function formatMinutesSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// One decimal is enough for any real increment and keeps kg from showing the full
// conversion tail (2.5 lb is 1.1339... kg). Rounding happens on the DISPLAY value and the
// rounded number is what gets converted back for storage, so a stepper tap moves between
// round numbers in the unit the user is actually looking at instead of accumulating
// conversion drift.
function roundForDisplay(value: number): number {
  return Math.round(value * 10) / 10;
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; summary: string }
  | { kind: 'error'; message: string };

export default function SettingsScreen() {
  const db = useDatabase();
  const router = useRouter();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    getSettings(db).then((row) => {
      if (!cancelled) setSettings(row);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Writes immediately and takes the returned row as the new state rather than patching
  // local state optimistically — the row the database actually holds is the only version
  // worth rendering, and every other screen reads these defaults fresh on focus.
  const applyPatch = useCallback(
    async (patch: SettingsPatch) => {
      const row = await updateSettings(db, patch);
      setSettings(row);
    },
    [db],
  );

  const runExport = useCallback(async () => {
    setExportState({ kind: 'working' });
    try {
      const tables = await readAllTablesForExport(db);
      const exportedAt = new Date();
      await shareExportPayload(
        buildExportPayload(tables, { schemaVersion: SCHEMA_VERSION, exportedAt }),
        exportedAt,
      );
      setExportState({ kind: 'done', summary: summarizeExport(tables) });
    } catch (e) {
      // Surfaced in the UI, not swallowed and not sent anywhere: there is no crash
      // reporting in this app by design (CLAUDE.md "Hard constraint: no data collection"),
      // so the screen itself is the only place a failure can be seen. A backup button that
      // fails silently is worse than no backup button.
      setExportState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [db]);

  if (!settings) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      </SafeAreaView>
    );
  }

  const unit = settings.unitPreference;
  const displayIncrement = roundForDisplay(fromLb(settings.defaultWeightIncrement, unit));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <Text style={styles.sectionLabel}>Units</Text>
        <View style={styles.card}>
          <View style={styles.segmented}>
            {unitPreferences.map((option: UnitPreference) => {
              const selected = option === unit;
              return (
                <Pressable
                  key={option}
                  style={[styles.segment, selected && styles.segmentSelected]}
                  onPress={() => {
                    if (!selected) void applyPatch({ unitPreference: option });
                  }}
                >
                  <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.caption}>
            Display only. Every weight is stored in pounds and converted when shown, so
            switching back and forth never changes your history.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Defaults</Text>
        <View style={styles.card}>
          <Text style={styles.caption}>
            Used by every exercise that doesn&apos;t have its own override set on its
            exercise screen.
          </Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Rest timer</Text>
            <NumberStepper
              value={settings.defaultRestSeconds}
              step={15}
              min={15}
              formatValue={formatMinutesSeconds}
              onChange={(next) => void applyPatch({ defaultRestSeconds: Math.round(next) })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Weight increment ({unit})</Text>
            <NumberStepper
              value={displayIncrement}
              step={0.5}
              min={0.5}
              onChange={(next) =>
                void applyPatch({
                  defaultWeightIncrement: toLb(roundForDisplay(next), unit),
                })
              }
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Rep floor</Text>
            <NumberStepper
              value={settings.defaultRepFloor}
              step={1}
              min={1}
              onChange={(next) => void applyPatch({ defaultRepFloor: Math.round(next) })}
            />
            {/* CLAUDE.md "Rep floor": a floor of 1 reproduces the original behaviour
                exactly, so the control needs to say what raising it actually does
                rather than leaving the user to discover missing chart points. */}
            <Text style={styles.caption}>
              {settings.defaultRepFloor <= 1
                ? 'Every set counts toward progression. Raise this to stop heavy low-rep sets from defining a progression line.'
                : `Only sets of ${settings.defaultRepFloor} or more reps count toward progression charts and PRs. A session where nothing reaches it is still logged, it just adds no chart point.`}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Backup</Text>
        <View style={styles.card}>
          <Text style={styles.warning}>
            Notch stores everything on this phone and nowhere else. There is no account and
            no cloud backup, so deleting the app or losing the phone loses your training
            history permanently. Export regularly and keep the file somewhere safe.
          </Text>

          <Pressable
            style={[styles.exportButton, exportState.kind === 'working' && styles.exportBusy]}
            disabled={exportState.kind === 'working'}
            onPress={() => void runExport()}
          >
            {exportState.kind === 'working' ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Feather name="upload" size={16} color={colors.onAccent} />
            )}
            <Text style={styles.exportLabel}>
              {exportState.kind === 'working' ? 'Preparing export…' : 'Export all data as JSON'}
            </Text>
          </Pressable>

          {exportState.kind === 'done' && (
            <Text style={styles.exportDone}>Exported {exportState.summary}.</Text>
          )}
          {exportState.kind === 'error' && (
            <Text style={styles.exportError}>Export failed: {exportState.message}</Text>
          )}

          <Text style={styles.caption}>
            One JSON file containing every gym, exercise, template, session and set, handed
            to the share sheet so you can save it to Files, iCloud Drive, or send it to
            yourself. Importing it back isn&apos;t built yet, so keep the file rather than
            relying on re-importing soon.
          </Text>
        </View>

        <Text style={styles.footer}>
          Notch · schema {SCHEMA_VERSION}
          {'\n'}No accounts, no analytics, no network calls.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loading: { marginTop: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    ...text.label,
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radii.row,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radii.row - 2,
  },
  segmentSelected: { backgroundColor: colors.surfaceRaised },
  segmentLabel: { ...numeric.inline, color: colors.textMuted },
  segmentLabelSelected: { color: colors.textPrimary },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  caption: { ...text.meta, color: colors.textMuted, lineHeight: 17 },
  warning: { ...text.meta, color: colors.textSecondary, lineHeight: 18 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    paddingVertical: 14,
  },
  exportBusy: { opacity: 0.7 },
  exportLabel: { fontSize: 15, fontWeight: '600', color: colors.onAccent },
  exportDone: { ...text.meta, color: colors.textSuccess },
  exportError: { ...text.meta, color: colors.textError },
  footer: {
    ...text.meta,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
});
