import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { InitialImportDto } from '@appinity/shared';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Switch, Text, View } from 'react-native';
import { apiRequest } from '../src/api/client';
import { API } from '../src/config';
import { Body, Button, Card, ErrorCard, Screen, Small, TextField, Title } from '../src/components/ui';
import { fonts, spacing, usePalette } from '../src/theme';

/** Cómo funciona APPINITY, en tres pasos: así se entiende por qué lo siguiente es conectar fuentes. */
const STEPS = [
  { icon: 'link-variant', key: 'connect' },
  { icon: 'account-heart-outline', key: 'soulmates' },
  { icon: 'cards-outline', key: 'discover' },
] as const;

/**
 * Alta única (fase 13): el único momento de consentimiento. Al aceptar mayoría de edad y condiciones empieza la
 * importación de todo Google: Books y Calendar ya se concedieron al iniciar sesión (su primer sync arranca ahora, nunca
 * antes de aceptar) y se abre en seguida el consentimiento de Data Portability (Maps, YouTube, Play, valoraciones…),
 * que Google no deja pedir junto al inicio de sesión. Sin pasar por Perfil ni conectar fuente a fuente.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/v1/me/onboarding', { method: 'POST', body: { adult: true, termsAccepted: true, ...(name.trim() ? { displayName: name.trim() } : {}), ...(city.trim() ? { city: city.trim() } : {}) } });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      // Con las condiciones aceptadas, la importación arranca y Google pide su última confirmación (Data Portability).
      const returnUrl = Linking.createURL('profile');
      const imported = await apiRequest<InitialImportDto>('/v1/me/connections/initial-import', { method: 'POST', body: { returnUrl } });
      const next = imported.next;
      if (next?.kind === 'redirect' && !(next.localOnly && Platform.OS !== 'web')) {
        if (Platform.OS === 'web') {
          window.location.assign(next.authorizationUrl);
          return;
        }
        await WebBrowser.openAuthSessionAsync(next.authorizationUrl, returnUrl);
      }
      for (const key of ['connections', 'profiles', 'profile']) await queryClient.invalidateQueries({ queryKey: [key] });
      router.replace('/profile');
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const row = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
      <Body style={{ flex: 1 }}>{label}</Body>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );

  return (
    <Screen>
      <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 }}>
          {t('onboarding.title')}
        </Text>
        <Body muted>{t('onboarding.intro')}</Body>
      </View>
      <Card>
        <Title style={{ fontSize: 16 }}>{t('onboarding.howTitle')}</Title>
        {STEPS.map((step, i) => (
          <View key={step.key} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: c.primaryContainer,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={step.icon} size={20} color={c.onPrimaryContainer} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '700' }}>{`${i + 1}. ${t(`onboarding.steps.${step.key}.title`)}`}</Body>
              <Small>{t(`onboarding.steps.${step.key}.text`)}</Small>
            </View>
          </View>
        ))}
      </Card>
      <Card>
        <TextField label={t('onboarding.nameLabel')} help={t('onboarding.nameHelp')} value={name} onChangeText={setName} maxLength={60} />
        <TextField
          label={t('onboarding.cityLabel')}
          help={t('onboarding.cityNote')}
          placeholder={t('onboarding.cityPlaceholder')}
          value={city}
          onChangeText={setCity}
          autoComplete="off"
          maxLength={80}
        />
        {row(t('onboarding.adult'), adult, setAdult)}
        {row(t('onboarding.terms'), terms, setTerms)}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button label={t('onboarding.readTerms')} variant="secondary" size="small" icon="file-document-outline" onPress={() => void WebBrowser.openBrowserAsync(`${API.url}/legal/condiciones`)} />
          <Button label={t('onboarding.readPrivacy')} variant="secondary" size="small" icon="shield-account-outline" onPress={() => void WebBrowser.openBrowserAsync(`${API.url}/legal/privacidad`)} />
        </View>
        <Small>{t('onboarding.consentNote')}</Small>
        <Small>{t('onboarding.googleNote')}</Small>
        {error ? <ErrorCard error={error} /> : null}
        <Button label={t('onboarding.continue')} onPress={() => void submit()} disabled={!adult || !terms} loading={saving} />
      </Card>
    </Screen>
  );
}
