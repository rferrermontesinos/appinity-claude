import type { SoulmateDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useChatInbox, useSoulmates } from '../../src/api/queries';
import { ChatInbox } from '../../src/components/ChatInbox';
import { FriendsCard } from '../../src/components/FriendsCard';
import { InviteCard } from '../../src/components/InviteCard';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Badge, Body, Card, ErrorCard, Loading, Screen, Small, Title } from '../../src/components/ui';
import { spacing, usePalette } from '../../src/theme';

function SoulmateRow({ person }: { person: SoulmateDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const value = formatAffinity(person.score);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.rank}. ${person.displayName}, ${t('people.affinity')} ${value ?? '—'}`}
      onPress={() => router.push(`/person/${person.userId}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: c.textMuted, width: 24, textAlign: 'right', fontWeight: '700' }}>{person.rank}</Text>
      <PersonAvatar name={person.displayName} url={person.avatarUrl} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
          {person.displayName}
          {person.countryCode ? <Text style={{ color: c.textMuted, fontWeight: '400' }}> · {person.countryCode}</Text> : null}
        </Text>
        <Small>{t('people.categoriesCompared', { count: person.categoriesCompared })}</Small>
        {person.exceptionalMutual ? <Badge label={t('people.exceptionalMutual')} color={c.ok} /> : null}
      </View>
      <Text style={{ color: c.accent, fontWeight: '800', fontSize: 18 }}>{value === null ? '—' : t('people.affinityValue', { value })}</Text>
    </Pressable>
  );
}

type Segment = 'chats' | 'people';

/** Selector superior: Chats (con aviso de pendientes) y Almas gemelas y amigos. */
function Segments({ value, onChange, badge }: { value: Segment; onChange: (s: Segment) => void; badge: number }) {
  const { t } = useTranslation();
  const c = usePalette();
  const items: Array<{ key: Segment; label: string }> = [
    { key: 'chats', label: t('chat.tabChats') },
    { key: 'people', label: t('chat.tabPeople') },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 999, padding: 4 }}>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.key === 'chats' && badge ? `${item.label} (${badge})` : item.label}
            onPress={() => onChange(item.key)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: selected ? c.surface : 'transparent' }}
          >
            <Text style={{ color: selected ? c.text : c.textMuted, fontWeight: selected ? '800' : '600' }} numberOfLines={1}>
              {item.label}
            </Text>
            {item.key === 'chats' && badge ? (
              <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                <Text style={{ color: c.accentText, fontSize: 11, fontWeight: '800' }}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * People: Chats (fase 12A, el núcleo social: interés → match → conversación), Top 50 almas gemelas y amigos (fase 10).
 * La app mantiene cuatro pestañas: el chat vive aquí, con aviso en la propia pestaña.
 */
export default function PeopleScreen() {
  const [segment, setSegment] = useState<Segment>('chats');
  const soulmates = useSoulmates();
  const inbox = useChatInbox();
  const refreshing = segment === 'chats' ? inbox.isRefetching : soulmates.isRefetching;
  const refresh = () => void (segment === 'chats' ? inbox.refetch() : soulmates.refetch());
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Segments value={segment} onChange={setSegment} badge={inbox.data?.badge ?? 0} />
      {segment === 'chats' ? <ChatInbox onExplore={() => setSegment('people')} /> : <SoulmatesAndFriends />}
    </Screen>
  );
}

function SoulmatesAndFriends() {
  const { t } = useTranslation();
  const soulmates = useSoulmates();
  return (
    <>
      <InviteCard />
      <Card>
        <Title>{t('people.soulmates')}</Title>
        <Body muted>{t('people.soulmatesIntro')}</Body>
        {soulmates.isLoading ? <Loading /> : null}
        {soulmates.error ? <ErrorCard error={soulmates.error} onRetry={() => void soulmates.refetch()} /> : null}
        {soulmates.data && !soulmates.data.items.length ? <Body muted>{t('people.soulmatesEmpty')}</Body> : null}
        {soulmates.data?.items.length ? (
          <>
            <Small>{t('people.soulmatesCount', { count: soulmates.data.items.length, limit: soulmates.data.limit })}</Small>
            {soulmates.data.items.map((p) => (
              <SoulmateRow key={p.userId} person={p} />
            ))}
            <Small>{t('people.affinityHint')}</Small>
          </>
        ) : null}
      </Card>
      <FriendsCard />
    </>
  );
}
