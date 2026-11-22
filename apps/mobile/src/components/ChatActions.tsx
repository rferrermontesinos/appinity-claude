import type { PublicPersonDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useChatAction, useChatConfig } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { Badge, Body, Button, Card, ErrorCard, Small, Title } from './ui';

/**
 * Chat desde el perfil (fase 12A), como el «like» de Tinder: «Quiero hablar» no envía ningún mensaje; si la otra
 * persona también quiere (o acepta), hay match y se abre el chat. Con match, «Enviar mensaje».
 */
export function ChatActions({ person }: { person: PublicPersonDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const config = useChatConfig();
  const action = useChatAction();
  const chat = person.chat;
  const onMatch = (r: { conversationId: string | null; newMatch: boolean } | null) => {
    if (!r?.conversationId) return;
    router.push(r.newMatch ? `/match/${r.conversationId}` : `/chat/${r.conversationId}`);
  };

  if (chat.state === 'matched') {
    return (
      <Card>
        <Button label={t('chat.sendMessage')} icon="chat-outline" onPress={() => router.push(`/chat/${chat.conversationId}`)} />
      </Card>
    );
  }
  if (chat.state === 'request_received') {
    return (
      <Card>
        <Title>{t('chat.receivedTitle', { name: person.displayName })}</Title>
        {chat.firstMessage ? (
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, padding: spacing.md }}>
            <Body>{chat.firstMessage}</Body>
          </View>
        ) : null}
        {action.error ? <ErrorCard error={action.error} /> : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={t(chat.kind === 'direct' ? 'chat.reply' : 'chat.acceptAndChat')}
            icon="chat-processing-outline"
            loading={action.isPending}
            onPress={() => action.mutate({ kind: 'accept', requestId: chat.requestId }, { onSuccess: onMatch })}
          />
          <Button label={t('chat.ignore')} variant="secondary" disabled={action.isPending} onPress={() => action.mutate({ kind: 'ignore', requestId: chat.requestId })} />
        </View>
        <Small>{t('chat.ignoreHint')}</Small>
      </Card>
    );
  }
  if (config.data && !config.data.earlyAccess) {
    return (
      <Card>
        <Small>{t('chat.disabled')}</Small>
      </Card>
    );
  }
  return (
    <Card>
      {action.error ? <ErrorCard error={action.error} /> : null}
      {chat.state === 'none' ? (
        <>
          <Button
            label={t('chat.wantToTalk')}
            icon="chat-plus-outline"
            loading={action.isPending}
            onPress={() => action.mutate({ kind: 'interest', userId: person.userId }, { onSuccess: onMatch })}
          />
          <Small>{t('chat.wantToTalkHint')}</Small>
        </>
      ) : (
        <>
          <Badge label={t('chat.interestSent')} color={c.accent} />
          <Small>{t('chat.interestSentHint')}</Small>
        </>
      )}
    </Card>
  );
}
