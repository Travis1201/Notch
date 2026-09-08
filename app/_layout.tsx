import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { colors } from '../constants/theme';
import { DatabaseProvider } from '../db/DatabaseProvider';

// Single dark theme, not system-adaptive — see notch-ui-mockups.html and
// app.json's userInterfaceStyle.
export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBg }}>
      <DatabaseProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.pageBg } }}
        />
      </DatabaseProvider>
    </View>
  );
}
