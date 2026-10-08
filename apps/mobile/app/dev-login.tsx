import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDevLogin, useDevUsers } from '../src/api/queries';
import { Diagnostics } from '../src/components/Diagnostics';
import { Body, Card, DemoBanner, ErrorCard, Loading, Screen, Small, Title } from '../src/components/ui';
import { radius, spacing, usePalette } from '../src/theme';

export default function DevLoginScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const users = useDevUsers();
  const login = useDevLogin();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <Screen>
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: c.accent, fontSize: 28, fontWeight: '800' }}>{t('common.appName')}</Text>
          <Body muted>{t('common.tagline')}</Body>
        </View>
        <DemoBanner detailed />
        <Title>{t('devLogin.title')}</Title>
        <Body muted>{t('devLogin.help')}</Body>
        {users.isLoading ? <Loading /> : null}
        {users.isError ? <ErrorCard error={users.error} onRetry={() => void users.refetch()} /> : null}
        {login.isError ? <ErrorCard error={login.error} /> : null}
        {users.data?.map((user) => (
          <Pressable
            key={user.id}
            accessibilityRole="button"
            accessibilityLabel={user.displayName}
            onPress={() => login.mutate(user.handle)}
            disabled={login.isPending}
            style={({ pressed }) => ({ opacity: pressed || login.isPending ? 0.7 : 1, borderRadius: radius.md })}
          >
            <Card>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>
                {user.displayName} · @{user.handle}
              </Text>
              <Small>{user.description}</Small>
            </Card>
          </Pressable>
        ))}
        <Diagnostics />
      </Screen>
    </SafeAreaView>
  );
}
