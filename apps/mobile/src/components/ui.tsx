import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type Category } from '@appinity/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { radius, spacing, usePalette } from '../theme';

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const c = usePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
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
        { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: spacing.lg, gap: spacing.sm },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = usePalette();
  return <Text style={[{ color: c.text, fontSize: 18, fontWeight: '700' }, style]}>{children}</Text>;
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
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const c = usePalette();
  const bg = variant === 'primary' ? c.accent : 'transparent';
  const fg = variant === 'primary' ? c.accentText : variant === 'danger' ? c.danger : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.sm,
        borderWidth: variant === 'primary' ? 0 : 1,
        borderColor: fg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <MaterialCommunityIcons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, color, background }: { label: string; color: string; background?: string }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
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

/** Aviso permanente de datos simulados (DEMO_MODE). */
export function DemoBanner({ detailed }: { detailed?: boolean }) {
  const c = usePalette();
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="text"
      style={{ backgroundColor: c.demoBg, borderRadius: radius.sm, padding: spacing.md, gap: 4, borderWidth: 1, borderColor: `${c.demo}55` }}
    >
      <Text style={{ color: c.demo, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>{t('demo.banner')}</Text>
      {detailed ? <Text style={{ color: c.text, fontSize: 12, lineHeight: 17 }}>{t('demo.bannerDetail')}</Text> : null}
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

export function ErrorCard({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const c = usePalette();
  const { t } = useTranslation();
  return (
    <Card style={{ borderColor: c.danger }}>
      <Title style={{ color: c.danger, fontSize: 16 }}>{t('common.errorTitle')}</Title>
      <Body muted>{error instanceof Error ? error.message : String(error)}</Body>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}
