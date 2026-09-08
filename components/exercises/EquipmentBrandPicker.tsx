import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/theme';
import { EQUIPMENT_BRAND_MAJORS } from '../../constants/equipmentBrands';

interface Props {
  visible: boolean;
  currentBrand: string | null;
  onSelect: (brand: string | null) => void;
  onClose: () => void;
}

// CLAUDE.md v1 scope: "Equipment brand via combobox: filters a seed list of majors
// ... accepts free text, remembers per exercise+gym" (the "remembers" part lives in
// db/queries/equipmentVariants.ts's getLastUsedBrand, called when an exercise is
// added — this picker only handles picking/changing it).
export function EquipmentBrandPicker({ visible, currentBrand, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const trimmed = query.trim();
  const filtered = EQUIPMENT_BRAND_MAJORS.filter((brand) =>
    brand.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const exactMatch = EQUIPMENT_BRAND_MAJORS.some(
    (brand) => brand.toLowerCase() === trimmed.toLowerCase(),
  );

  function select(brand: string | null) {
    onSelect(brand);
    onClose();
  }

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Equipment brand</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search or type a brand"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          ListHeaderComponent={
            <>
              {!trimmed && (
                <Pressable style={styles.row} onPress={() => select(null)}>
                  <Text style={[styles.rowLabel, currentBrand === null && styles.rowLabelSelected]}>
                    No brand
                  </Text>
                </Pressable>
              )}
              {trimmed.length > 0 && !exactMatch && (
                <Pressable style={styles.row} onPress={() => select(trimmed)}>
                  <Text style={styles.rowLabel}>Use "{trimmed}"</Text>
                </Pressable>
              )}
            </>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => select(item)}>
              <Text style={[styles.rowLabel, currentBrand === item && styles.rowLabelSelected]}>
                {item}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  closeLabel: { fontSize: 15, color: colors.accent },
  searchInput: {
    margin: 16,
    height: 44,
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 15, color: colors.textPrimary },
  rowLabelSelected: { color: colors.accent, fontWeight: '600' },
});
