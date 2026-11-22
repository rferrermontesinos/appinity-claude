import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, type, usePalette } from '../theme';

/** Botón redondo de la cabecera (48×48): «Volver» o una acción. */
export function HeaderButton({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.hairline, opacity: pressed ? 0.7 : 1 })}
    >
      <MaterialCommunityIcons name={icon} size={22} color={c.text} />
    </Pressable>
  );
}

/**
 * Cabecera única de las pantallas de detalle («Aura»): sin barra nativa, para que el fondo de la pantalla (halo, tinte
 * de categoría) siga sin cortes. «Volver» redondo a la izquierda; título opcional (cuando el contenido no lo repite,
 * p. ej. el chat) y acciones a la derecha. Respeta el área segura (barra de estado y muesca).
 * Uso: `<Stack.Screen options={{ headerShown: false }} />` y `<DetailHeader … />` como primer elemento.
 */
export function DetailHeader({ title, right, fallback = '/' }: { title?: string; right?: ReactNode; fallback?: Href }) {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.sm }}>
      <HeaderButton icon="arrow-left" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))} />
      {title ? (
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: c.text, ...type.h3 }}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}
