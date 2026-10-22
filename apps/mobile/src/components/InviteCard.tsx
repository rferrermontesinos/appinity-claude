import type { InvitationDto } from '@appinity/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share } from 'react-native';
import { apiRequest } from '../api/client';
import { Body, Button, Card, ErrorCard, Small, Title } from './ui';

/**
 * Invitar amigos (crecimiento por grupos): un enlace que, al aceptarlo, crea la amistad directamente. Sin red, la app
 * no puede encontrar almas gemelas; con tus amigos dentro, sí.
 */
export function InviteCard() {
  const { t } = useTranslation();
  const [invitation, setInvitation] = useState<InvitationDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function invite() {
    setLoading(true);
    setError(null);
    try {
      const inv = invitation ?? (await apiRequest<InvitationDto>('/v1/me/invitations', { method: 'POST' }));
      setInvitation(inv);
      const url = Platform.OS === 'web' ? (inv.webUrl ?? inv.appUrl) : inv.appUrl;
      const message = t('invite.message', { url });
      if (Platform.OS === 'web' && globalThis.navigator?.clipboard) {
        await globalThis.navigator.clipboard.writeText(message);
        setCopied(true);
      } else {
        await Share.share({ message });
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <Title>{t('invite.title')}</Title>
      <Body muted>{t('invite.intro')}</Body>
      {error ? <ErrorCard error={error} /> : null}
      <Button label={t(Platform.OS === 'web' ? 'invite.copy' : 'invite.share')} icon="account-plus" onPress={() => void invite()} loading={loading} />
      {copied ? <Small>{t('invite.copied')}</Small> : null}
      {invitation ? <Small>{t('invite.expires', { date: new Date(invitation.expiresAt).toLocaleDateString() })}</Small> : null}
    </Card>
  );
}
