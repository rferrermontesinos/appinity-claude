import type { InvitationAcceptDto, InvitationPreviewDto } from '@appinity/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../src/api/client';
import { Body, Button, Card, ErrorCard, Loading, Screen, Title } from '../../src/components/ui';

/** Aceptar una invitación: muestra quién invita y, al aceptar, sois amigos y se abre el chat. */
export default function InviteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { code } = useLocalSearchParams<{ code: string }>();
  const preview = useQuery({
    queryKey: ['invitation', code],
    queryFn: () => apiRequest<InvitationPreviewDto>(`/v1/invitations/${encodeURIComponent(code ?? '')}`),
    enabled: Boolean(code),
    retry: false,
  });
  const [error, setError] = useState<unknown>(null);
  const [accepting, setAccepting] = useState(false);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const result = await apiRequest<InvitationAcceptDto>(`/v1/invitations/${encodeURIComponent(code ?? '')}/accept`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['friends'] });
      await queryClient.invalidateQueries({ queryKey: ['chats'] });
      router.replace(`/person/${result.inviterId}`);
    } catch (e) {
      setError(e);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Title>{t('invite.acceptTitle')}</Title>
        {preview.isLoading ? <Loading /> : null}
        {preview.error ? <ErrorCard error={preview.error} /> : null}
        {preview.data ? (
          <>
            <Body>{t('invite.acceptIntro', { name: preview.data.inviterName })}</Body>
            {error ? <ErrorCard error={error} /> : null}
            <Button label={t('invite.accept')} icon="account-check" onPress={() => void accept()} loading={accepting} />
          </>
        ) : null}
        <Button label={t('invite.later')} variant="secondary" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
