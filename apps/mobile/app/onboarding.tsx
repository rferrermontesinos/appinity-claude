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
import { finishConnect, useSources } from '../src/api/queries';
import { API } from '../src/config';
import { Body, Button, Card, ErrorCard, Screen, Small, TextField } from '../src/components/ui';
import { AuraCard, onPoster } from '../src/components/Aura';
import { radius, spacing, type, usePalette } from '../src/theme';

/** Cómo funciona APPINITY, en tres pasos: así se entiende por qué lo siguiente es conectar fuentes. */
const STEPS = [
  { icon: 'link-variant', key: 'connect' },
  { icon: 'account-heart-outline', key: 'soulmates' },
  { icon: 'cards-outline', key: 'discover' },
] as const;

/**
 * Alta única (fase 13): el único momento de consentimiento, para todas las fuentes (las de ahora y las que se añadan;
 * decisión del titular 2026-11-22). Incluye dos opciones de privacidad, apagadas por defecto. Al aceptar mayoría de edad y condiciones empieza la
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
  // Opciones de privacidad del alta (2026-11-22): apagadas por defecto y a la vista, una sola vez.
  const [shareCommon, setShareCommon] = useState(false);
  const [contacts, setContacts] = useState(false);
  // El consentimiento único cubre todas las fuentes reales del servidor: una fuente nueva aparece aquí sola.
  const sources = useSources();
  const sourceList = (sources.data ?? [])
    .filter((s) => !s.simulated && s.connectable)
    .map((s) => t(`sources.names.${s.key}`, { defaultValue: s.name }))
    .join(', ');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/v1/me/onboarding', {
        method: 'POST',
        body: {
          adult: true,
          termsAccepted: true,
          shareCommonTastes: shareCommon,
          discoverableByContacts: contacts,
          ...(name.trim() ? { displayName: name.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      // Con las condiciones aceptadas, la importación arranca y Google pide su última confirmación (Data Portability).
      // Vuelve a Fuentes: allí se confirma la conexión en la web (en el móvil se confirma aquí mismo).
      const returnUrl = Linking.createURL('sources');
      const imported = await apiRequest<InitialImportDto>('/v1/me/connections/initial-import', { method: 'POST', body: { returnUrl } });
      const next = imported.next;
      if (next?.kind === 'redirect' && !(next.localOnly && Platform.OS !== 'web')) {
        if (Platform.OS === 'web') {
          window.location.assign(next.authorizationUrl);
          return;
        }
        const auth = await WebBrowser.openAuthSessionAsync(next.authorizationUrl, returnUrl);
        if (auth.type === 'success') await finishConnect(Linking.parse(auth.url).queryParams ?? {});
      }
      for (const key of ['connections', 'profiles', 'profile']) await queryClient.invalidateQueries({ queryKey: [key] });
      router.replace('/sources');
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const row = (label: string, value: boolean, onChange: (v: boolean) => void, help?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 48 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body>{label}</Body>
        {help ? <Small>{help}</Small> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );

  return (
    <Screen>
      {/* Bienvenida «Aura»: cartel con el saludo y los tres pasos (qué pasa al aceptar). */}
      <AuraCard accent={c.accent} style={{ marginTop: spacing.md, gap: spacing.md }}>
        <Text style={{ color: onPoster.lime, ...type.overline }}>APPINITY</Text>
        <Text accessibilityRole="header" style={{ color: onPoster.text, ...type.h1 }}>
          {t('onboarding.title')}
        </Text>
        <Text style={{ color: onPoster.muted, ...type.body }}>{t('onboarding.intro')}</Text>
        <View style={{ gap: spacing.md, marginTop: spacing.sm }} accessibilityRole="list" accessibilityLabel={t('onboarding.howTitle')}>
          {STEPS.map((step, i) => (
            <View key={step.key} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: onPoster.glass, alignItems: 'center', justifyContent: 'center' }}
              >
                <MaterialCommunityIcons name={step.icon} size={20} color={onPoster.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: onPoster.text, ...type.h4 }}>{`${i + 1}. ${t(`onboarding.steps.${step.key}.title`)}`}</Text>
                <Text style={{ color: onPoster.muted, ...type.caption }}>{t(`onboarding.steps.${step.key}.text`)}</Text>
              </View>
            </View>
          ))}
        </View>
      </AuraCard>
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
        {sourceList ? <Small>{t('onboarding.sourcesIncluded', { list: sourceList })}</Small> : null}
        <Small>{t('onboarding.googleNote')}</Small>
        <Body style={{ fontWeight: '700', marginTop: spacing.sm }}>{t('onboarding.optionsTitle')}</Body>
        {row(t('onboarding.shareCommon'), shareCommon, setShareCommon, t('onboarding.shareCommonHelp'))}
        {row(t('onboarding.contacts'), contacts, setContacts, t('onboarding.contactsHelp'))}
        {error ? <ErrorCard error={error} /> : null}
        <Button label={t('onboarding.continue')} onPress={() => void submit()} disabled={!adult || !terms} loading={saving} />
      </Card>
    </Screen>
  );
}
