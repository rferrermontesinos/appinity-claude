import type { ChatListItemDto, ChatRequestDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useChatAction, useChatInbox } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { PersonAvatar, formatAffinity } from './PersonAvatar';
import { Badge, Body, Button, Card, ErrorCard, Loading, Small, Title } from './ui';

/** Hora si es de hoy; si no, fecha corta. */
export function shortTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function AffinityText({ value }: { value: number | null }) {
  const { t } = useTranslation();
  const c = usePalette();
  const v = formatAffinity(value);
  return <Text style={{ color: c.accent, fontWeight: '800' }}>{v === null ? '—' : t('people.affinityValue', { value: v })}</Text>;
}

function RequestRow({ request }: { request: ChatRequestDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const action = useChatAction();
  const { person } = request;
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${person.displayName}, ${t(request.kind === 'direct' ? 'chat.requestDirect' : 'chat.requestInterest')}`}
        onPress={() => router.push(`/person/${person.userId}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <PersonAvatar name={person.displayName} url={person.avatarUrl} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
            {person.displayName}
          </Text>
          <Small>{t(request.kind === 'direct' ? 'chat.requestDirect' : 'chat.requestInterest')}</Small>
        </View>
        <AffinityText value={person.affinity} />
      </Pressable>
      {request.firstMessage ? (
        <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, padding: spacing.md }}>
          <Body>{request.firstMessage}</Body>
        </View>
      ) : null}
      {action.error ? <ErrorCard error={action.error} /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          label={t(request.kind === 'direct' ? 'chat.reply' : 'chat.acceptAndChat')}
          icon="chat-processing-outline"
          loading={action.isPending}
          onPress={() =>
            action.mutate(
              { kind: 'accept', requestId: request.requestId },
              { onSuccess: (r) => r?.conversationId && router.push(`/match/${r.conversationId}`) },
            )
          }
        />
        <Button label={t('chat.ignore')} variant="secondary" disabled={action.isPending} onPress={() => action.mutate({ kind: 'ignore', requestId: request.requestId })} />
      </View>
    </View>
  );
}

function NewMatch({ item }: { item: ChatListItemDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.person.displayName}${item.isNew ? `, ${t('chat.newMatchA11y')}` : ''}`}
      onPress={() => router.push(`/chat/${item.conversationId}`)}
      style={({ pressed }) => ({ width: 76, alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ borderWidth: 2, borderColor: item.isNew ? c.accent : 'transparent', borderRadius: 40, padding: 2 }}>
        <PersonAvatar name={item.person.displayName} url={item.person.avatarUrl} size={60} />
      </View>
      <Text style={{ color: c.text, fontSize: 12, fontWeight: item.isNew ? '800' : '500' }} numberOfLines={1}>
        {item.person.displayName}
      </Text>
    </Pressable>
  );
}

function ConversationRow({ item }: { item: ChatListItemDto }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const last = item.lastMessage!;
  const unread = item.unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.person.displayName}. ${last.mine ? t('chat.you') : ''}${last.body}${unread ? `. ${t('chat.unreadA11y', { count: item.unread })}` : ''}`}
      onPress={() => router.push(`/chat/${item.conversationId}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}
    >
      <PersonAvatar name={item.person.displayName} url={item.person.avatarUrl} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
            {item.person.displayName}
          </Text>
          <Small>{shortTime(last.createdAt, i18n.language)}</Small>
        </View>
        <Text style={{ color: unread ? c.text : c.textMuted, fontWeight: unread ? '700' : '400', fontSize: 14 }} numberOfLines={1}>
          {last.mine ? t('chat.you') : ''}
          {last.body}
        </Text>
      </View>
      {unread ? (
        <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text style={{ color: c.accentText, fontSize: 12, fontWeight: '800' }}>{item.unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Chats (fase 12A), como la pantalla de mensajes de Tinder: solicitudes recibidas, fila de nuevos matches (aún sin
 * mensajes) y conversaciones ordenadas por el último mensaje.
 */
export function ChatInbox({ onExplore }: { onExplore: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const inbox = useChatInbox();
  const data = inbox.data;
  if (inbox.isLoading) return <Loading />;
  if (inbox.error) return <ErrorCard error={inbox.error} onRetry={() => void inbox.refetch()} />;
  if (!data) return null;
  const empty = !data.requests.length && !data.matches.length && !data.conversations.length;
  return (
    <>
      {data.requests.length ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Title>{t('chat.requestsTitle')}</Title>
            <Badge label={String(data.requests.length)} color={c.accent} />
          </View>
          {data.requests.map((r) => (
            <RequestRow key={r.requestId} request={r} />
          ))}
          <Small>{t('chat.ignoreHint')}</Small>
        </Card>
      ) : null}
      {data.matches.length ? (
        <Card>
          <Title>{t('chat.newMatches')}</Title>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {data.matches.map((m) => (
              <NewMatch key={m.conversationId} item={m} />
            ))}
          </ScrollView>
        </Card>
      ) : null}
      {data.conversations.length ? (
        <Card>
          <Title>{t('chat.messages')}</Title>
          {data.conversations.map((m) => (
            <ConversationRow key={m.conversationId} item={m} />
          ))}
        </Card>
      ) : null}
      {empty ? (
        <Card>
          <Body muted>{t('chat.empty')}</Body>
          <Button label={t('chat.explore')} icon="account-heart-outline" onPress={onExplore} />
        </Card>
      ) : null}
      <Small>{t('chat.pollingNote')}</Small>
    </>
  );
}
