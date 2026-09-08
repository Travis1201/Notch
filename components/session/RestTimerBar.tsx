import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useRestTimerStore } from '../../store/restTimerStore';

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// CLAUDE.md "Rest timer": countdown on the logging screen itself, skippable and
// adjustable without leaving the screen. Docked at the screen's bottom while running.
export function RestTimerBar() {
  const isRunning = useRestTimerStore((s) => s.isRunning);
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const skip = useRestTimerStore((s) => s.skip);
  const addSeconds = useRestTimerStore((s) => s.addSeconds);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isRunning || endsAt === null) return null;

  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));

  return (
    <View style={styles.bar}>
      <Pressable hitSlop={8} onPress={() => addSeconds(-15)}>
        <Text style={styles.adjust}>−15s</Text>
      </Pressable>
      <Text style={styles.clock}>{formatClock(remaining)}</Text>
      <Pressable hitSlop={8} onPress={() => addSeconds(15)}>
        <Text style={styles.adjust}>+15s</Text>
      </Pressable>
      <Pressable hitSlop={8} onPress={skip} style={styles.skipButton}>
        <Text style={styles.skipLabel}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.accentTintBg,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  adjust: { fontSize: 13, color: colors.accentLight },
  clock: { fontSize: 17, fontWeight: '600', color: colors.accentLight, flex: 1, textAlign: 'center' },
  skipButton: { paddingHorizontal: 10, paddingVertical: 6 },
  skipLabel: { fontSize: 13, color: colors.textSecondary },
});
