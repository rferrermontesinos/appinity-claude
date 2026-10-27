import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ChatMessageDto } from '@appinity/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import {
  chatKeys,
  fetchOlderMessages,
  markChatRead,
  useChatAction,
  useConversation,
  usePerson,
  useSendMessage,
  useSocialAction,
} from '../../src/api/queries';
import { shortTime } from '../../src/components/ChatInbox';
import { DetailHeader, HeaderButton } from '../../src/components/DetailHeader';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Body, Button, Card, ErrorCard, Loading, Small } from '../../src/components/ui';
import { radius, spacing, type, usePalette } from '../../src/theme';

interface Pending {
  clientId: string;
  body: string;
  failed: boolean;
}

const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Sugerencia para romper el hielo: la categoría con más afinidad calculada (nunca objetos del historial ajeno). */
function Icebreaker({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const person = usePerson(userId);
  const best = person.data?.affinity.categories
    .filter((cat) => cat.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (!person.data) return null;
  return (
    <Card>
      <Small style={{ fontWeight: '700' }}>{t('chat.icebreakerTitle')}</Small>
      <Body muted>
        {best
          ? t('chat.icebreakerBest', { category: t(`categories.${best.category}`), value: formatAffinity(best.score) })
          : t('chat.icebreakerNone')}
      </Body>
    </Card>
  );
}

function Bubble({ body, mine, meta, failed, onRetry }: { body: string; mine: boolean; meta?: string; failed?: boolean; onRetry?: () => void }) {
  const c = usePalette();
  const { t } = useTranslation();
  return (
    <Pressable
      disabled={!onRetry}
      onPress={onRetry}
      // Solo es pulsable si el envío falló: entonces se anuncia como «reintentar».
      {...(onRetry ? { accessibilityRole: 'button' as const, accessibilityLabel: t('common.retry') } : {})}
      style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      <View
        style={{
          // La chispa es solo la acción principal («Aura»): el mensaje propio va en su contenedor tonal.
          backgroundColor: failed ? `${c.danger}22` : mine ? c.primaryContainer : c.surfaceAlt,
          borderRadius: radius.lg,
          borderBottomRightRadius: mine ? 4 : 18,
          borderBottomLeftRadius: mine ? 18 : 4,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Text style={{ color: failed ? c.danger : mine ? c.onPrimaryContainer : c.text, ...type.body }}>{body}</Text>
      </View>
      {meta ? <Small style={{ color: failed ? c.danger : c.textMuted }}>{meta}</Small> : null}
    </Pressable>
  );
}

/**
 * Conversación (fase 12A). Solo existe tras un match. Sin push (fase 12C): la última página se refresca cada pocos
 * segundos. Desde las opciones: ver perfil, deshacer el match o bloquear (el reporte, desde el perfil).
 */
export default function ChatScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const conversation = useConversation(id);
  const send = useSendMessage(id);
  const chatAction = useChatAction();
  const social = useSocialAction();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [older, setOlder] = useState<ChatMessageDto[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [menu, setMenu] = useState<null | 'open' | 'unmatch' | 'block'>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const data = conversation.data;
  const person = data?.conversation.person;
  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessageDto>();
    for (const m of [...older, ...(data?.messages ?? [])]) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [older, data?.messages]);
  const hasMore = olderHasMore ?? data?.hasMore ?? false;

  // Marca como leído cuando llega un mensaje nuevo de la otra persona (o al abrir).
  const lastIncoming = [...messages].reverse().find((m) => !m.mine)?.id ?? 'none';
  const loaded = Boolean(data);
  useEffect(() => {
    if (!loaded) return;
    void markChatRead(id)
      .then(() => queryClient.invalidateQueries({ queryKey: chatKeys.inbox }))
      .catch(() => undefined);
  }, [id, lastIncoming, loaded, queryClient]);

  const lastMine = [...messages].reverse().find((m) => m.mine);
  const seen = lastMine && data?.conversation.otherLastReadAt && data.conversation.otherLastReadAt >= lastMine.createdAt;

  const submit = (item?: Pending) => {
    const body = item?.body ?? draft.trim();
    if (!body) return;
    const clientId = item?.clientId ?? newClientId();
    if (!item) {
      setDraft('');
      setPending((p) => [...p, { clientId, body, failed: false }]);
    } else {
      setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, failed: false } : x)));
    }
    setRateLimited(false);
    send.mutate(
      { body, clientId },
      {
        onSuccess: () => setPending((p) => p.filter((x) => x.clientId !== clientId)),
        onError: (error) => {
          setRateLimited(error instanceof ApiError && error.status === 429);
          setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, failed: true } : x)));
        },
      },
    );
  };

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    setLoadingOlder(true);
    try {
      const page = await fetchOlderMessages(id, first.createdAt);
      setOlder((o) => [...page.messages, ...o]);
      setOlderHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/people'));

  type Row = { key: string; body: string; mine: boolean; meta?: string; failed?: boolean; retry?: Pending };
  const rows: Row[] = [
    ...messages.map((m) => ({
      key: m.id,
      body: m.body,
      mine: m.mine,
      meta: m.id === lastMine?.id ? `${shortTime(m.createdAt, i18n.language)}${seen ? ` · ${t('chat.seen')}` : ''}` : undefined,
    })),
    ...pending.map((p) => ({ key: p.clientId, body: p.body, mine: true, meta: p.failed ? t('chat.failed') : t('chat.sending'), failed: p.failed, retry: p.failed ? p : undefined })),
  ].reverse();

  return (
    // Android 15+ dibuja la app de borde a borde: la ventana ya no se encoge con el teclado y «height» deja la caja de
    // texto debajo. «padding» en ambas plataformas; sin barra nativa (cabecera única de detalle), sin desplazamiento.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior="padding" keyboardVerticalOffset={0}>
      <Stack.Screen options={{ headerShown: false, title: person?.displayName ?? t('chat.tabChats') }} />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <DetailHeader
          fallback="/people"
          title={person?.displayName ?? t('chat.tabChats')}
          right={<HeaderButton icon="dots-vertical" label={t('chat.options')} onPress={() => setMenu((m) => (m ? null : 'open'))} />}
        />
      </View>
      {conversation.isLoading ? <Loading /> : null}
      {conversation.error ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorCard error={conversation.error} onRetry={() => void conversation.refetch()} />
        </View>
      ) : null}
      {menu && person ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderColor: c.border }}>
          {menu === 'open' ? (
            <>
              <Button label={t('chat.viewProfile')} icon="account-outline" variant="secondary" onPress={() => router.push(`/person/${person.userId}`)} />
              <Button label={t('chat.unmatch')} icon="heart-off-outline" variant="secondary" onPress={() => setMenu('unmatch')} />
              <Button label={t('people.block')} icon="block-helper" variant="danger" onPress={() => setMenu('block')} />
              <Small>{t('chat.reportHint')}</Small>
            </>
          ) : null}
          {menu === 'unmatch' ? (
            <>
              <Body>{t('chat.unmatchConfirm')}</Body>
              <Button label={t('people.confirm')} variant="danger" loading={chatAction.isPending} onPress={() => chatAction.mutate({ kind: 'unmatch', conversationId: id }, { onSuccess: leave })} />
            </>
          ) : null}
          {menu === 'block' ? (
            <>
              <Body>{t('chat.blockConfirm')}</Body>
              <Button label={t('people.confirm')} variant="danger" loading={social.isPending} onPress={() => social.mutate({ kind: 'block', userId: person.userId }, { onSuccess: leave })} />
            </>
          ) : null}
          {chatAction.error ? <ErrorCard error={chatAction.error} /> : null}
          {social.error ? <ErrorCard error={social.error} /> : null}
        </View>
      ) : null}
      {data && person ? (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Bubble body={item.body} mine={item.mine} meta={item.meta} failed={item.failed} onRetry={item.retry ? () => submit(item.retry) : undefined} />
          )}
          ListFooterComponent={
            <View style={{ gap: spacing.md, alignItems: 'center', paddingBottom: spacing.md }}>
              {hasMore ? <Button label={t('chat.loadOlder')} variant="secondary" loading={loadingOlder} onPress={() => void loadOlder()} /> : null}
              {!hasMore ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.openProfile', { name: person.displayName })}
                  onPress={() => router.push(`/person/${person.userId}`)}
                  style={{ alignItems: 'center', gap: spacing.xs }}
                >
                  <PersonAvatar name={person.displayName} url={person.avatarUrl} size={72} />
                  <Text style={{ color: c.text, ...type.h4 }}>{person.displayName}</Text>
                  <Small>
                    {t('chat.matchedOn', { date: new Date(data.conversation.matchedAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) })}
                    {person.affinity !== null ? ` · ${t('chat.matchAffinity', { value: formatAffinity(person.affinity) })}` : ''}
                  </Small>
                </Pressable>
              ) : null}
              {!messages.length ? (
                <View style={{ alignSelf: 'stretch' }}>
                  <Icebreaker userId={person.userId} />
                </View>
              ) : null}
            </View>
          }
        />
      ) : null}
      {data ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.sm), gap: spacing.xs, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          {rateLimited ? <Small style={{ color: c.danger }}>{t('chat.rateLimited')}</Small> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={c.textMuted}
              accessibilityLabel={t('chat.placeholder')}
              multiline
              maxLength={1000}
              style={{ flex: 1, minHeight: 48, maxHeight: 120, color: c.text, backgroundColor: c.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...type.body }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              disabled={!draft.trim()}
              onPress={() => submit()}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: radius.full,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !draft.trim() ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <MaterialCommunityIcons name="send" size={20} color={c.accentText} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
