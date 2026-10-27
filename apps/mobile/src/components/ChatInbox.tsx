import type { ChatListItemDto, ChatRequestDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useChatAction, useChatInbox } from '../api/queries';
import { fonts, radius, spacing, usePalette } from '../theme';
import { AuraCard, onPoster } from './Aura';
import { PersonAvatar, formatAffinity } from './PersonAvatar';
import { Body, Button, EmptyState, ErrorCard, Skeleton, Small } from './ui';

/** Hora si es de hoy; si no, fecha corta. */
export function shortTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * Cartel de la conversación más reciente (mismo patrón que el cartel de Almas gemelas): la persona, vuestra afinidad
 * en grande, el último mensaje y «Responder».
 */
function LatestHero({ item }: { item: ChatListItemDto }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const last = item.lastMessage!;
  const value = formatAffinity(item.person.affinity);
  return (
    <AuraCard accent={c.accent} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PersonAvatar name={item.person.displayName} url={item.person.avatarUrl} size={56} ring={onPoster.lime} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: onPoster.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('chat.latestKicker')}</Text>
          <Text accessibilityRole="header" style={{ color: onPoster.text, fontFamily: fonts.displayHeavy, fontSize: 24, letterSpacing: -0.6 }} numberOfLines={1}>
            {item.person.displayName}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: onPoster.lime, fontFamily: fonts.displayHeavy, fontSize: 30, letterSpacing: -1 }}>
            {value ?? '—'}
            {value !== null ? <Text style={{ fontSize: 14, color: onPoster.muted, letterSpacing: 0 }}> %</Text> : null}
          </Text>
          <Text style={{ color: onPoster.muted, fontSize: 11 }}>{t('people.affinity')}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: `${onPoster.base}73`, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
        <Text style={{ color: onPoster.muted, fontSize: 12 }}>
          {last.mine ? t('chat.you') : `${item.person.displayName}: `}
          {shortTime(last.createdAt, i18n.language)}
        </Text>
        <Text style={{ color: onPoster.text, fontSize: 15 }} numberOfLines={2}>
          {last.body}
        </Text>
      </View>
      <Button label={item.unread ? t('chat.replyCount', { count: item.unread }) : t('chat.open')} icon="chat-processing-outline" onPress={() => router.push(`/chat/${item.conversationId}`)} />
    </AuraCard>
  );
}

/** Fila de conversación (mismo patrón que las filas de Almas gemelas): avatar con aro, nombre, último mensaje y hora. */
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
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 64, opacity: pressed ? 0.7 : 1 })}
    >
      <PersonAvatar name={item.person.displayName} url={item.person.avatarUrl} size={48} ring />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
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
        <View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text style={{ color: c.accentText, fontSize: 12, fontWeight: '800' }}>{item.unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Mensajes antiguos que esperaban respuesta (del modelo anterior): se pueden contestar o ignorar. */
function LegacyRequest({ request }: { request: ChatRequestDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const action = useChatAction();
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PersonAvatar name={request.person.displayName} url={request.person.avatarUrl} size={48} ring />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
            {request.person.displayName}
          </Text>
          <Small>{t('chat.wantsToTalk')}</Small>
        </View>
      </View>
      {request.firstMessage ? <Body>{request.firstMessage}</Body> : null}
      {action.error ? <ErrorCard error={action.error} /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          label={t('chat.reply')}
          size="small"
          icon="chat-processing-outline"
          loading={action.isPending}
          onPress={() => action.mutate({ kind: 'accept', requestId: request.requestId }, { onSuccess: (r) => r?.conversationId && router.push(`/chat/${r.conversationId}`) })}
        />
        <Button label={t('chat.ignore')} size="small" variant="secondary" disabled={action.isPending} onPress={() => action.mutate({ kind: 'ignore', requestId: request.requestId })} />
      </View>
    </View>
  );
}

/**
 * Chats (2026-10-27): solo conversaciones en las que alguien ha escrito, ordenadas por el último mensaje. Sin «match»:
 * a cualquier persona visible se le puede escribir desde su perfil («Escribir»), y el chat aparece al primer mensaje.
 * Mismo patrón que Almas gemelas: cartel con la conversación más reciente y filas debajo.
 */
export function ChatInbox({ onExplore }: { onExplore: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const inbox = useChatInbox();
  const data = inbox.data;
  if (inbox.isLoading) return <Skeleton rows={3} height={72} />;
  if (inbox.error) return <ErrorCard error={inbox.error} onRetry={() => void inbox.refetch()} />;
  if (!data) return null;
  const [latest, ...rest] = data.conversations;
  return (
    <>
      {data.requests.map((r) => (
        <LegacyRequest key={r.requestId} request={r} />
      ))}
      {latest ? <LatestHero item={latest} /> : null}
      {rest.length ? (
        <View>
          <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, marginTop: spacing.sm, marginBottom: spacing.xs }}>
            {t('chat.moreConversations')}
          </Text>
          {rest.map((m) => (
            <ConversationRow key={m.conversationId} item={m} />
          ))}
        </View>
      ) : null}
      {!latest && !data.requests.length ? (
        <EmptyState icon="chat-outline" title={t('chat.emptyTitle')} body={t('chat.empty')} action={{ label: t('chat.explore'), icon: 'account-heart-outline', onPress: onExplore }} />
      ) : null}
      <Small>{t('chat.pollingNote')}</Small>
    </>
  );
}
