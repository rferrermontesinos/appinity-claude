import type { AuthSessionDto } from '@appinity/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../src/api/client';
import { Body, Button, Card, Loading, Screen, Title } from '../src/components/ui';
import { useSession } from '../src/state/session';

/**
 * Vuelta de «Continuar con Google» (fase 13). La API deja un código de un solo uso en la URL; aquí se canjea por la
 * sesión (los tokens nunca viajan en la URL) y se va al alta si falta.
 */
export default function AuthReturnScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ auth?: string; code?: string; message?: string }>();
  const [error, setError] = useState<string | null>(params.auth === 'error' ? (params.message ?? t('auth.failed')) : null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || params.auth !== 'ok' || !params.code) return;
    started.current = true;
    void apiRequest<AuthSessionDto>('/v1/auth/exchange', { method: 'POST', body: { code: params.code }, auth: false })
      .then(async (session) => {
        // Caché vacía antes de la sesión nueva (ver useDevLogin).
        queryClient.clear();
        await useSession.getState().setSession({ token: session.accessToken, expiresAt: session.expiresAt, refreshToken: session.refreshToken, handle: '', kind: 'user' });
        router.replace(session.needsOnboarding ? '/onboarding' : '/');
      })
      .catch((e: Error) => setError(e.message));
  }, [params.auth, params.code, queryClient, router]);

  return (
    <Screen>
      <Card>
        <Title>{t('auth.title')}</Title>
        {error ? (
          <>
            <Body muted>{error}</Body>
            <Button label={t('auth.back')} onPress={() => router.replace('/dev-login')} />
          </>
        ) : (
          <Loading />
        )}
      </Card>
    </Screen>
  );
}
