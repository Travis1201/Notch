import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../constants/theme';
import { useDatabase } from '../../db/DatabaseProvider';
import { createTemplate } from '../../db/queries/templates';
import { TemplateForm } from '../../components/templates/TemplateForm';

export default function NewTemplateScreen() {
  const db = useDatabase();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>New template</Text>
        <View style={{ width: 18 }} />
      </View>

      <TemplateForm
        submitLabel="Create template"
        onCancel={() => router.back()}
        onSubmit={async ({ name, exerciseIds }) => {
          await createTemplate(db, { name, exerciseIds });
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
