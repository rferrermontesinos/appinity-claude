import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useChatInbox } from '../../src/api/queries';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, usePalette } from '../../src/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: Array<{ name: string; titleKey: string; icon: IconName }> = [
  { name: 'index', titleKey: 'tabs.home', icon: 'cards-outline' },
  { name: 'categories', titleKey: 'tabs.categories', icon: 'shape-outline' },
  { name: 'people', titleKey: 'tabs.people', icon: 'account-heart-outline' },
  { name: 'profile', titleKey: 'tabs.profile', icon: 'account-circle-outline' },
];

/** Cuatro pestañas principales: Home, Categories, People (con los chats y su aviso) y Profile. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const c = usePalette();
  const badge = useChatInbox().data?.badge ?? 0;
  // Android dibuja la app bajo la barra de gestos/botones (edge-to-edge): la barra inferior suma ese margen.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: c.background },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.hairline, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.textSubtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarAccessibilityLabel: tab.name === 'people' && badge ? `${t(tab.titleKey)} (${badge})` : t(tab.titleKey),
            tabBarBadge: tab.name === 'people' && badge ? badge : undefined,
            tabBarBadgeStyle: { backgroundColor: c.danger, color: c.background, fontSize: 11 },
            // Píldora en la pestaña seleccionada (sistema de diseño: bottom navigation).
            tabBarIcon: ({ color, focused }) => (
              <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? c.primaryContainer : 'transparent' }}>
                <MaterialCommunityIcons name={tab.icon} color={focused ? c.onPrimaryContainer : color} size={22} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
