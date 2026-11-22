import type { AuthProvidersDto } from '@appinity/shared';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { apiRequest } from '../api/client';
import { API } from '../config';
import { Body, Button, Card, Small, Title } from './ui';

/**
 * «Continuar con Google» (fase 13). La API hace el flujo OAuth y vuelve a /auth con un código de un solo uso. En la
 * web, página completa (Google corta el vínculo con las ventanas emergentes). Solo se muestra si la API lo ofrece.
 */
export function GoogleSignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: () => apiRequest<AuthProvidersDto>('/v1/auth/providers', { auth: false }) });
  if (!providers.data?.google) return null;
  const returnUrl = Linking.createURL('auth');
  const startUrl = `${API.url}/v1/auth/google/start?returnUrl=${encodeURIComponent(returnUrl)}`;
  // En desarrollo Google solo vuelve a localhost: en el teléfono no llegaría a la API del PC.
  const devPhone = Platform.OS !== 'web' && !API.url.startsWith('https://');

  async function start() {
    if (Platform.OS === 'web') {
      window.location.assign(startUrl);
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
    if (result.type !== 'success') return;
    const params = Linking.parse(result.url).queryParams ?? {};
    router.replace({ pathname: '/auth', params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v ?? '')])) });
  }

  return (
    <Card>
      <Title>{t('auth.signInTitle')}</Title>
      <Body muted>{t('auth.signInIntro')}</Body>
      <Button label={t('auth.google')} icon="google" onPress={() => void start()} disabled={devPhone} />
      {devPhone ? <Small>{t('auth.devPhoneNote')}</Small> : null}
    </Card>
  );
}
