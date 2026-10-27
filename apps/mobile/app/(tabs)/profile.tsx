import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useConnections, useMe } from '../../src/api/queries';
import { DataBanner } from '../../src/components/DataBanner';
import { ProfileHero } from '../../src/components/ProfileHero';
import { TastesCard } from '../../src/components/TastesCard';
import { ErrorCard, Loading, Screen, Small } from '../../src/components/ui';
import { radius, spacing, usePalette } from '../../src/theme';

/** Fila que abre una pantalla propia (Fuentes, Ajustes): icono, título, resumen y flecha. */
function NavRow({ icon, title, subtitle, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 64,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primaryContainer }}>
        <MaterialCommunityIcons name={icon} size={22} color={c.onPrimaryContainer} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
        <Small>{subtitle}</Small>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={c.textSubtle} />
    </Pressable>
  );
}

/**
 * Perfil (2026-10-26): corto. Tu cartel, Tus gustos y dos accesos: Fuentes (de donde salen tus gustos) y Ajustes
 * (preferencias, privacidad, cuenta, Premium y diagnóstico), cada uno en su pantalla.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const connections = useConnections();
  const active = (connections.data ?? []).filter((c) => c.status === 'active').length;
  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <DataBanner />
      {me.isLoading ? <Loading /> : null}
      {me.isError ? <ErrorCard error={me.error} onRetry={() => void me.refetch()} /> : null}
      {me.data ? (
        <>
          <ProfileHero me={me.data} />
          <TastesCard />
          <NavRow
            icon="link-variant"
            title={t('sources.title')}
            subtitle={active ? t('profile.sourcesConnected', { count: active }) : t('profile.sourcesNone')}
            onPress={() => router.push('/sources')}
          />
          <NavRow icon="cog-outline" title={t('profile.settings')} subtitle={t('profile.settingsRowHint')} onPress={() => router.push('/settings')} />
        </>
      ) : null}
    </Screen>
  );
}
