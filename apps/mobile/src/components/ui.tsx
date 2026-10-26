import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type Category } from '@appinity/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { fonts, radius, spacing, type, usePalette } from '../theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
  background,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Fondo propio (p. ej., el tinte de una categoría); por defecto, el de la paleta. */
  background?: string;
}) {
  const c = usePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: background ?? c.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  return (
    <View
      style={[
        { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.hairline, padding: spacing.lg, gap: spacing.sm },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = usePalette();
  // Encabezado de sección: con TalkBack se puede saltar de uno a otro.
  return (
    <Text accessibilityRole="header" style={[{ color: c.text, ...type.h4 }, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style, muted }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean }) {
  const c = usePalette();
  return <Text style={[{ color: muted ? c.textMuted : c.text, fontSize: 15, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Small({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = usePalette();
  return <Text style={[{ color: c.textMuted, fontSize: 12, lineHeight: 17 }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  size = 'medium',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  /** small: 36 de alto (acciones secundarias en fila, p. ej. en las fuentes); el área táctil sigue siendo ≥ 44. */
  size?: 'small' | 'medium';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const c = usePalette();
  const bg = variant === 'primary' ? c.accent : 'transparent';
  // Sistema de diseño: píldora; contained en violeta, outlined con borde neutro y texto violeta apto para texto.
  const fg = variant === 'primary' ? c.accentText : variant === 'danger' ? c.danger : c.primaryInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={size === 'small' ? 6 : 0}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.full,
        minHeight: size === 'small' ? 36 : 48,
        ...(size === 'small' ? { alignSelf: 'flex-start' as const } : {}),
        borderWidth: variant === 'primary' ? 0 : 1,
        borderColor: variant === 'danger' ? c.danger : c.border,
        paddingVertical: size === 'small' ? spacing.xs : spacing.md,
        paddingHorizontal: size === 'small' ? spacing.md : spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <MaterialCommunityIcons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: size === 'small' ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, color, background }: { label: string; color: string; background?: string }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: radius.full,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        backgroundColor: background ?? `${color}22`,
        borderWidth: 1,
        borderColor: `${color}66`,
      }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

/**
 * Aviso permanente del tipo de datos: simulados (usuarios de demo, DEMO_MODE) o reales (cuenta local con fuentes
 * reales). `live` lo decide quien conoce el usuario de la sesión.
 */
export function DemoBanner({ detailed, live }: { detailed?: boolean; live?: boolean }) {
  const c = usePalette();
  const { t } = useTranslation();
  const color = live ? c.ok : c.demo;
  return (
    <View
      accessibilityRole="text"
      style={{
        backgroundColor: live ? `${c.ok}18` : c.demoBg,
        borderRadius: radius.sm,
        padding: spacing.md,
        gap: 4,
        borderWidth: 1,
        borderColor: `${color}55`,
      }}
    >
      <Text style={{ color, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>{t(live ? 'demo.liveBanner' : 'demo.banner')}</Text>
      {detailed ? (
        <Text style={{ color: c.text, fontSize: 12, lineHeight: 17 }}>{t(live ? 'demo.liveBannerDetail' : 'demo.bannerDetail')}</Text>
      ) : null}
    </View>
  );
}

export function PendingNotice({ phase, text }: { phase: string; text: string }) {
  const c = usePalette();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <MaterialCommunityIcons name="progress-clock" size={20} color={c.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Small style={{ fontWeight: '700' }}>{t('common.pendingPhase', { phase })}</Small>
        <Body muted>{text}</Body>
      </View>
    </View>
  );
}

export function Row({ label, value, valueColor }: { label: string; value: ReactNode; valueColor?: string }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' }}>
      <Text style={{ color: c.textMuted, fontSize: 14, flexShrink: 1 }}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={{ color: valueColor ?? c.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function CategoryIcon({ category, size = 22 }: { category: Category; size?: number }) {
  const meta = CATEGORY_META[category];
  return (
    <View
      style={{
        width: size * 1.8,
        height: size * 1.8,
        borderRadius: size,
        backgroundColor: `${meta.color}22`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons
        name={meta.icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={size}
        color={meta.color}
      />
    </View>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View style={{ padding: spacing.xl, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

/**
 * Esqueleto de carga («Aura»): bloques con la forma del contenido que llega, con un pulso suave (sin pulso si el sistema
 * pide reducir movimiento). Oculto al lector de pantalla; se anuncia «Cargando».
 */
export function Skeleton({ rows = 3, height = 76, style }: { rows?: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  return (
    <View accessible accessibilityLabel={t('common.loading')} accessibilityRole="progressbar" style={[{ gap: spacing.sm }, style]}>
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={{ height, borderRadius: radius.lg, backgroundColor: c.surfaceRaised, opacity: reduce ? 0.8 : pulse }} />
      ))}
    </View>
  );
}

export function ErrorCard({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const c = usePalette();
  const { t } = useTranslation();
  return (
    <Card style={{ borderColor: c.danger }}>
      <Title style={{ color: c.danger }}>{t('common.errorTitle')}</Title>
      <Body muted>{error instanceof Error ? error.message : String(error)}</Body>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

/**
 * Estado vacío / arranque en frío («Aura»): icono en una superficie neutra (la chispa queda para la acción), título en display, explicación y
 * UNA acción principal (más, como mucho, una secundaria pequeña). Explica por qué está vacío; nunca inventa contenido.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  secondary,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  action?: { label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void };
  secondary?: { label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void };
}) {
  const c = usePalette();
  return (
    <View
      style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border }}
    >
      <View style={{ width: 72, height: 72, borderRadius: radius.full, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={icon} size={32} color={c.text} />
      </View>
      <Text style={{ color: c.text, ...type.h3, textAlign: 'center' }} accessibilityRole="header">
        {title}
      </Text>
      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>{body}</Text>
      {action ? <Button label={action.label} icon={action.icon} onPress={action.onPress} /> : null}
      {secondary ? <Button label={secondary.label} icon={secondary.icon} variant="secondary" size="small" onPress={secondary.onPress} /> : null}
    </View>
  );
}

/**
 * Campo de texto del sistema de diseño (variante «outlined»): etiqueta visible encima (no solo el placeholder, que
 * desaparece al escribir), caja de 52 px, borde de acento al enfocar y texto de ayuda o de error debajo.
 */
export function TextField({
  label,
  help,
  error,
  style,
  ...input
}: Omit<TextInputProps, 'style'> & { label: string; help?: string; error?: string | null; style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  const [focused, setFocused] = useState(false);
  const border = error ? c.danger : focused ? c.accent : c.border;
  return (
    <View style={[{ gap: 4 }, style]}>
      <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '500' }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textSubtle}
        accessibilityLabel={label}
        accessibilityHint={error ?? help}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={{
          minHeight: 52,
          // El borde de 2 px al enfocar se compensa en el relleno para que el texto no salte.
          paddingHorizontal: spacing.md - (focused || error ? 1 : 0),
          color: c.text,
          fontSize: 16,
          borderWidth: focused || error ? 2 : 1,
          borderColor: border,
          borderRadius: radius.md,
          backgroundColor: c.surface,
        }}
      />
      {error || help ? (
        <Text style={{ color: error ? c.danger : c.textMuted, fontSize: 12, lineHeight: 17 }}>{error ?? help}</Text>
      ) : null}
    </View>
  );
}
