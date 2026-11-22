import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDevLogin, useDevUsers } from '../src/api/queries';
import { GoogleSignIn } from '../src/components/GoogleSignIn';
import { Diagnostics } from '../src/components/Diagnostics';
import { Body, Button, Card, DemoBanner, ErrorCard, Loading, Screen, Small, TextField, Title } from '../src/components/ui';
import { radius, spacing, usePalette } from '../src/theme';

/** Cuenta local real (dataset live) creada con `pnpm user:local`: handle + código de un solo uso. */
function LocalAccountCard() {
  const { t } = useTranslation();
  const login = useDevLogin();
  const [handle, setHandle] = useState('');
  const [code, setCode] = useState('');
  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('devLogin.localTitle')}</Title>
      <Small>{t('devLogin.localHelp')}</Small>
      <TextField label={t('devLogin.handle')} value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} />
      <TextField
        label={t('devLogin.code')}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        secureTextEntry
      />
      {login.isError ? <ErrorCard error={login.error} /> : null}
      <Button
        label={t('devLogin.signIn')}
        icon="account-key"
        disabled={!handle.trim() || code.trim().length < 8}
        loading={login.isPending}
        onPress={() => login.mutate({ handle: handle.trim().toLowerCase(), code: code.trim() })}
      />
    </Card>
  );
}

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
        <GoogleSignIn />
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
            onPress={() => login.mutate({ handle: user.handle })}
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
        <LocalAccountCard />
        <Diagnostics />
      </Screen>
    </SafeAreaView>
  );
}
