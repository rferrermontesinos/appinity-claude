import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePalette } from '../../src/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: Array<{ name: string; titleKey: string; icon: IconName }> = [
  { name: 'index', titleKey: 'tabs.home', icon: 'cards-outline' },
  { name: 'categories', titleKey: 'tabs.categories', icon: 'shape-outline' },
  { name: 'people', titleKey: 'tabs.people', icon: 'account-heart-outline' },
  { name: 'profile', titleKey: 'tabs.profile', icon: 'account-circle-outline' },
];

/** Cuatro pestañas principales: Home, Categories, People y Profile. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarAccessibilityLabel: t(tab.titleKey),
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={tab.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
