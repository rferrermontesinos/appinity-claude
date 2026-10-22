import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, TextInput, View } from 'react-native';
import { apiRequest } from '../src/api/client';
import { Body, Button, Card, ErrorCard, Screen, Small, Title } from '../src/components/ui';
import { radius, spacing, usePalette } from '../src/theme';

/**
 * Alta (fase 13): el único momento de consentimiento. Mayoría de edad y condiciones aquí; justo después, en Perfil, se
 * conectan las fuentes (cada una pide su permiso una sola vez). Nada más se pedirá después.
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
      <Card>
        <Title>{t('onboarding.title')}</Title>
        <Body muted>{t('onboarding.intro')}</Body>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.namePlaceholder')}
          placeholderTextColor={c.textMuted}
          accessibilityLabel={t('onboarding.namePlaceholder')}
          maxLength={60}
          style={{ color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, padding: spacing.md }}
        />
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder={t('onboarding.cityPlaceholder')}
          placeholderTextColor={c.textMuted}
          accessibilityLabel={t('onboarding.cityPlaceholder')}
          autoComplete="off"
          maxLength={80}
          style={{ color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, padding: spacing.md }}
        />
        <Small>{t('onboarding.cityNote')}</Small>
        {row(t('onboarding.adult'), adult, setAdult)}
        {row(t('onboarding.terms'), terms, setTerms)}
        <Small>{t('onboarding.consentNote')}</Small>
        {error ? <ErrorCard error={error} /> : null}
        <Button label={t('onboarding.continue')} onPress={() => void submit()} disabled={!adult || !terms} loading={saving} />
      </Card>
    </Screen>
  );
}
