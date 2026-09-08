import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';

export default function ExercisesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Exercises</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface1,
  },
  title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
});
