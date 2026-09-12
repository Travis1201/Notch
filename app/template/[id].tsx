import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  getTemplate,
  getTemplateExercises,
  updateTemplateName,
  setTemplateExercises,
  deleteTemplate,
} from '../../db/queries/templates';
import type { Template } from '../../db/types';
import { TemplateForm, type TemplateExerciseRef } from '../../components/templates/TemplateForm';

export default function EditTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDatabase();

  const [template, setTemplate] = useState<Template | null>(null);
  const [exercises, setExercises] = useState<TemplateExerciseRef[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      Promise.all([getTemplate(db, id), getTemplateExercises(db, id)]).then(([t, rows]) => {
        if (cancelled) return;
        setTemplate(t);
        setExercises(rows.map((r) => ({ exerciseId: r.exerciseId, name: r.exercise.name })));
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [db, id]),
  );

  if (loading || !template) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit template</Text>
        <View style={{ width: 18 }} />
      </View>

      <TemplateForm
        initialName={template.name}
        initialExercises={exercises}
        submitLabel="Save changes"
        onCancel={() => router.back()}
        onSubmit={async ({ name, exerciseIds }) => {
          await updateTemplateName(db, template.id, name);
          await setTemplateExercises(db, template.id, exerciseIds);
          router.back();
        }}
        onDelete={async () => {
          await deleteTemplate(db, template.id);
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
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
});
