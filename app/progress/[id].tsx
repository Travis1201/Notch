import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { colors, numeric, radii, text } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  listTrackedVariants,
  getVariantSessionHistory,
  type TrackedVariantSummary,
  type VariantSessionPoint,
} from '../../db/queries/progress';
import { getSettings } from '../../db/queries/settings';
import { fromLb } from '../../lib/units';
import { didImprove } from '../../lib/progression';
import { TopSetChart } from '../../components/progress/TopSetChart';
import type { Settings } from '../../db/types';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// CLAUDE.md "Progress tab" detail view: equipment variant pills (never merged —
// that's the whole differentiator), current best top set with change since start, a
// line chart of top-set weight over time, then a recent-sessions list carrying reps
// and RIR. The chart is components/progress/TopSetChart — drawn from
// notch-ui-mockups.html's SVG geometry, on react-native-svg rather than a charting
// library, for the reasons that component documents. It replaced a plain-View bar
// visualisation that stood in while there was no chart dependency at all.
export default function ProgressDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();

  const [current, setCurrent] = useState<TrackedVariantSummary | null>(null);
  const [siblings, setSiblings] = useState<TrackedVariantSummary[]>([]);
  const [points, setPoints] = useState<VariantSessionPoint[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      Promise.all([listTrackedVariants(db), getVariantSessionHistory(db, id), getSettings(db)]).then(
        ([all, history, settingsRow]) => {
          if (cancelled) return;
          const self = all.find((v) => v.variantId === id) ?? null;
          setCurrent(self);
          setSiblings(self ? all.filter((v) => v.exerciseId === self.exerciseId) : []);
          setPoints(history);
          setSettings(settingsRow);
          setLoading(false);
        },
      );
      return () => {
        cancelled = true;
      };
    }, [db, id]),
  );

  if (loading || !current || !settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const unit = settings.unitPreference;
  const formatWeight = (lb: number) => fromLb(lb, unit);

  const withTopSet = points.filter((p) => p.topSet !== null);
  const first = withTopSet[0] ?? null;
  const last = withTopSet[withTopSet.length - 1] ?? null;
  const changeLb = first && last ? last.topSet!.weight - first.topSet!.weight : 0;
  // Rounded in DISPLAY units, not lb: a 25 lb gain read in kg is 11.339..., and the
  // mockup's badge is a whole number ("35 lb"). Rounding the converted value keeps
  // the badge and the caption agreeing with each other in either unit.
  const changeDisplay = Math.round(fromLb(changeLb, unit));

  const chartPoints = withTopSet.map((p) => ({
    date: p.date,
    weight: formatWeight(p.topSet!.weight),
  }));

  const recent = [...withTopSet].reverse();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{current.exerciseName}</Text>
        <View style={{ width: 18 }} />
      </View>

      {siblings.length >= 1 && (
        <View style={styles.pillRow}>
          {siblings.map((s) => {
            const selected = s.variantId === current.variantId;
            return (
              <Pressable
                key={s.variantId}
                style={[styles.pill, selected && styles.pillSelected]}
                onPress={() => !selected && router.replace(`/progress/${s.variantId}`)}
              >
                <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
                  {s.brand ?? 'No brand'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {last?.topSet && (
          <>
            <View style={styles.bestRow}>
              <Text style={styles.bestValue}>{formatWeight(last.topSet.weight)}</Text>
              <Text style={styles.bestTimes}>×</Text>
              <Text style={styles.bestValue}>{last.topSet.reps}</Text>
              {changeDisplay !== 0 && (
                <View style={styles.changeBadge}>
                  <Feather
                    name={changeDisplay > 0 ? 'arrow-up-right' : 'arrow-down-right'}
                    size={14}
                    color={changeDisplay > 0 ? colors.textSuccess : colors.textMuted}
                  />
                  <Text style={[styles.changeLabel, changeDisplay < 0 && styles.changeLabelMuted]}>
                    {Math.abs(changeDisplay)} {unit}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.bestCaption}>
              Best top set
              {changeDisplay !== 0
                ? ` · ${changeDisplay > 0 ? 'up' : 'down'} ${Math.abs(changeDisplay)} ${unit} since ${DATE_FORMAT.format(first!.date)}`
                : ''}
            </Text>
          </>
        )}

        {/* CLAUDE.md "Empty states": "Progress, fewer than 2 sessions for a lift:
            explain that a trend needs a couple more sessions rather than rendering a
            one-point chart." A variant can reach this screen with only one plottable
            session even though the Progress list filters at two — a rep floor can
            leave an otherwise-logged session with no eligible top set at all. */}
        {chartPoints.length >= 2 ? (
          <View style={styles.chartBlock}>
            <TopSetChart points={chartPoints} formatDate={(d) => DATE_FORMAT.format(d)} />
          </View>
        ) : (
          <Text style={styles.chartEmptyText}>
            A trend needs a couple more sessions on this equipment before there is a line
            worth plotting.
          </Text>
        )}

        <Text style={styles.sectionLabel}>Recent sessions</Text>
        {recent.map((p, i) => {
          const previous = recent[i + 1] ?? null;
          const improved = didImprove(p.topSet, previous?.topSet ?? null);
          return (
            <View key={p.sessionId} style={styles.sessionRow}>
              <Text style={styles.sessionDate}>{DATE_FORMAT.format(p.date)}</Text>
              {p.topSet ? (
                <View style={styles.sessionValueRow}>
                  <Text style={[styles.sessionNumber, styles.sessionWeight]}>
                    {formatWeight(p.topSet.weight)}
                  </Text>
                  <Text style={styles.sessionTimes}>×</Text>
                  <Text style={[styles.sessionNumber, styles.sessionReps]}>{p.topSet.reps}</Text>
                </View>
              ) : (
                <Text style={[styles.sessionValueRow, styles.sessionNone]}>—</Text>
              )}
              {p.topSet && (
                <View style={styles.sessionRirGroup}>
                  <Text style={styles.sessionRirValue}>{p.topSet.rir >= 4 ? '4+' : p.topSet.rir}</Text>
                  <Text style={styles.sessionRirLabel}>RIR</Text>
                </View>
              )}
              {/* A fixed slot, so rows with and without an arrow keep RIR aligned. */}
              <View style={styles.arrowSlot}>
                {improved && <Feather name="arrow-up-right" size={14} color={colors.textSuccess} />}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
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
  pillRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  pillSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillLabel: { fontSize: 12, color: colors.textSecondary },
  pillLabelSelected: { color: colors.onAccent },
  content: { padding: 16 },
  bestRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 2 },
  bestValue: { ...numeric.display, color: colors.textPrimary },
  bestTimes: { fontSize: 20, color: colors.textMuted },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  changeLabel: { ...numeric.inline, color: colors.textSuccess },
  changeLabelMuted: { color: colors.textMuted },
  bestCaption: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  chartBlock: { marginBottom: 16 },
  chartEmptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 20 },
  sectionLabel: { ...text.label, color: colors.textMuted, marginBottom: 4 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  sessionDate: { ...text.meta, color: colors.textMuted, width: 54 },
  sessionValueRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline' },
  sessionNumber: { ...numeric.set, fontSize: 17, color: colors.textPrimary },
  sessionWeight: { width: 60, textAlign: 'right' },
  sessionTimes: { fontSize: 12, color: colors.textMuted, marginHorizontal: 5 },
  sessionReps: { width: 28 },
  sessionNone: { color: colors.textMuted },
  sessionRirGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  sessionRirValue: { ...numeric.inline, fontSize: 14, color: colors.textSecondary },
  sessionRirLabel: { fontSize: 10, color: colors.textMuted },
  arrowSlot: { width: 14, alignItems: 'flex-end' },
});
