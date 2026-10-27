import type { PublicPersonDto } from '@appinity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../api/client';
import { useChatConfig } from '../api/queries';
import { Button, Card, ErrorCard, Small } from './ui';

/**
 * Chat desde el perfil (2026-10-27): siempre se puede escribir a la otra persona, sin «match». «Escribir» abre (o
 * recupera) la conversación; aparece en la bandeja de los dos en cuanto alguien envía un mensaje.
 */
export function ChatActions({ person }: { person: PublicPersonDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const config = useChatConfig();
  const open = useMutation({
    mutationFn: () => apiRequest<{ conversationId: string }>('/v1/me/chats/open', { method: 'POST', body: { userId: person.userId } }),
    onSuccess: async ({ conversationId }) => {
      await queryClient.invalidateQueries({ queryKey: ['chat'] });
      router.push(`/chat/${conversationId}`);
    },
  });

  if (config.data && !config.data.earlyAccess) {
    return (
      <Card>
        <Small>{t('chat.disabled')}</Small>
      </Card>
    );
  }
  // Conversación ya abierta (con o sin mensajes): directo al chat.
  const existing = person.chat.state === 'matched' ? person.chat.conversationId : null;
  return (
    <Card>
      {open.error ? <ErrorCard error={open.error} /> : null}
      <Button
        label={t('chat.write', { name: person.displayName })}
        icon="chat-outline"
        loading={open.isPending}
        onPress={() => (existing ? router.push(`/chat/${existing}`) : open.mutate())}
      />
      <Small>{t('chat.writeHint')}</Small>
    </Card>
  );
}
