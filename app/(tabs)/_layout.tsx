import { Tabs } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';

// CLAUDE.md "Home screen": "Tab bar: Home / Progress / Exercises / History."
//
// Icons mirror notch-ui-mockups.html's Tabler set (ti-home, ti-chart-line, ti-list,
// ti-calendar). Feather covers three of the four; its closest chart glyph is
// `trending-up`, an arrow rather than a plotted line, so Progress draws from
// MaterialCommunityIcons' `chart-line` instead — the same shape as the mockup's.
// Both families ship inside @expo/vector-icons, so this costs no new dependency.
const TAB_ICON_SIZE = 19; // .tab i { font-size: 19px } in the mockup

function TabIcon({ route, color }: { route: string; color: ColorValue }) {
  if (route === 'progress') {
    return <MaterialCommunityIcons name="chart-line" size={TAB_ICON_SIZE} color={color} />;
  }
  const name = route === 'index' ? 'home' : route === 'exercises' ? 'list' : 'calendar';
  return <Feather name={name} size={TAB_ICON_SIZE} color={color} />;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        // The mockup's bar is a 0.5px hairline over the page background with 10px above the icon
        // and 12px below the label. The bottom inset is added on top of that padding
        // rather than replacing it, so the labels clear the home indicator on a
        // notched phone instead of sitting under it.
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: 56 + insets.bottom,
          paddingTop: 10,
          paddingBottom: 12 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, marginTop: 3 },
        tabBarIconStyle: { height: TAB_ICON_SIZE },
        tabBarIcon: ({ color }) => <TabIcon route={route.name} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="exercises" options={{ title: 'Exercises' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
