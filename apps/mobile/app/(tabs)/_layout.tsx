import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useChatInbox } from '../../src/api/queries';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, usePalette } from '../../src/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Icono en contorno y, en la pestaña activa, relleno (la forma también marca dónde estás, no solo el color). */
const TABS: Array<{ name: string; titleKey: string; icon: IconName; iconActive: IconName }> = [
  { name: 'index', titleKey: 'tabs.home', icon: 'cards-outline', iconActive: 'cards' },
  { name: 'categories', titleKey: 'tabs.categories', icon: 'shape-outline', iconActive: 'shape' },
  { name: 'people', titleKey: 'tabs.people', icon: 'account-heart-outline', iconActive: 'account-heart' },
  { name: 'profile', titleKey: 'tabs.profile', icon: 'account-circle-outline', iconActive: 'account-circle' },
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
        headerTitleStyle: { fontFamily: fonts.displayHeavy, fontSize: 26 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: c.background },
        // «Aura»: barra anclada con esquinas superiores redondeadas y borde fino (sin sombra de sistema).
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.hairline,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: 72 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 10,
          elevation: 0,
          boxShadow: '0px -12px 32px -18px rgba(0,0,0,0.7)',
        },
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.textSubtle,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            // Inicio sin cabecera: la tarjeta gana altura (la barra inferior ya dice dónde estás).
            headerShown: tab.name !== 'index',
            tabBarAccessibilityLabel: tab.name === 'people' && badge ? `${t(tab.titleKey)} (${badge})` : t(tab.titleKey),
            tabBarBadge: tab.name === 'people' && badge ? badge : undefined,
            // La barra tiene altura fija: la etiqueta crece con el tamaño de texto del sistema solo hasta 1,3× (pauta de
            // Material para la navegación inferior); el icono y la etiqueta accesible siguen ahí con cualquier tamaño.
            tabBarLabel: ({ color, children }) => (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                {children}
              </Text>
            ),
            tabBarBadgeStyle: { backgroundColor: c.accent, color: c.accentText, fontSize: 11, fontWeight: '700' },
            // Pestaña activa: línea de chispa encima e icono relleno en claro (como en la maqueta).
            tabBarIcon: ({ color, focused }) => (
              <View style={{ width: 56, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', top: -8, width: 22, height: 3, borderRadius: 2, backgroundColor: focused ? c.accent : 'transparent' }} />
                <MaterialCommunityIcons name={focused ? tab.iconActive : tab.icon} color={color} size={24} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
