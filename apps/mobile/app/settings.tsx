import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useMe } from '../src/api/queries';
import { AccountCard } from '../src/components/AccountCard';
import { CreditsCard } from '../src/components/CreditsCard';
import { Diagnostics } from '../src/components/Diagnostics';
import { PremiumCard } from '../src/components/PremiumCard';
import { SettingsCard } from '../src/components/SettingsCard';
import { Badge, Button, Card, ErrorCard, Loading, Screen, Small, Title } from '../src/components/ui';
import { useSession } from '../src/state/session';
import { spacing, usePalette } from '../src/theme';

/**
 * Ajustes agrupados (2026-10-26): preferencias y privacidad, Premium, cuenta y, al final, créditos y diagnóstico.
 * La identidad de desarrollo (cambiar de usuario) solo aparece con una sesión de desarrollo.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const me = useMe();
  const clear = useSession((s) => s.clear);
  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <Stack.Screen options={{ title: t('profile.settings') }} />
      {me.isLoading ? <Loading /> : null}
      {me.isError ? <ErrorCard error={me.error} onRetry={() => void me.refetch()} /> : null}
      {me.data ? (
        <>
          <SettingsCard settings={me.data.settings} />
          <PremiumCard />
          <AccountCard me={me.data} />
          {me.data.authKind === 'dev' ? (
            <Card>
              <Title style={{ fontSize: 16 }}>{t('profile.devTitle')}</Title>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Badge label={t('profile.devIdentity')} color={c.demo} />
                <Badge label={`dataset: ${me.data.user.dataset}`} color={c.textMuted} />
              </View>
              <Small>{t('profile.devIdentityHelp')}</Small>
              <Button label={t('profile.switchUser')} variant="secondary" icon="account-switch" onPress={() => void clear()} />
            </Card>
          ) : null}
        </>
      ) : null}
      <CreditsCard />
      <Diagnostics />
    </Screen>
  );
}
