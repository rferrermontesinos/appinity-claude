import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { SoulmateDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useChatInbox, useFollowing, useSoulmates } from '../../src/api/queries';
import { ChatInbox } from '../../src/components/ChatInbox';
import { FollowingCard } from '../../src/components/FollowingCard';
import { FriendsCard } from '../../src/components/FriendsCard';
import { InviteCard } from '../../src/components/InviteCard';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { SoulmateHero } from '../../src/components/SoulmateHero';
import { Badge, Card, ErrorCard, Loading, Screen, Small, Title, EmptyState } from '../../src/components/ui';
import { fonts, spacing, usePalette } from '../../src/theme';

/** Fila de alma gemela («Aura»): avatar con aro lima, nombre y país, cifra grande y acceso al perfil. */
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
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 64, opacity: pressed ? 0.7 : 1 })}
    >
      <PersonAvatar name={person.displayName} url={person.avatarUrl} size={48} ring />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
          {person.displayName}
          {person.countryCode ? <Text style={{ color: c.textMuted, fontWeight: '400' }}> · {person.countryCode}</Text> : null}
        </Text>
        <Small>{t('people.categoriesCompared', { count: person.categoriesCompared })}</Small>
        {person.exceptionalMutual ? <Badge label={t('people.exceptionalMutual')} color={c.affinity} /> : null}
      </View>
      <Text style={{ color: value === null ? c.textSubtle : c.text, fontFamily: fonts.displayHeavy, fontSize: 24, letterSpacing: -0.8 }}>
        {value ?? '—'}
        {value !== null ? <Text style={{ fontSize: 13, color: c.textMuted, letterSpacing: 0 }}> %</Text> : null}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={c.textSubtle} />
    </Pressable>
  );
}

type Segment = 'chats' | 'people' | 'following';

/** Selector superior: Chats (con aviso de pendientes) y Almas gemelas y amigos. */
function Segments({ value, onChange, badge }: { value: Segment; onChange: (s: Segment) => void; badge: number }) {
  const { t } = useTranslation();
  const c = usePalette();
  const items: Array<{ key: Segment; label: string }> = [
    { key: 'people', label: t('chat.tabPeople') },
    { key: 'following', label: t('chat.tabFollowing') },
    { key: 'chats', label: t('chat.tabChats') },
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
  // Por defecto, las almas gemelas (el núcleo de People); los chats están a un toque.
  const [segment, setSegment] = useState<Segment>('people');
  const soulmates = useSoulmates();
  const inbox = useChatInbox();
  const following = useFollowing();
  const refreshing = segment === 'chats' ? inbox.isRefetching : segment === 'following' ? following.isRefetching : soulmates.isRefetching;
  const refresh = () => void (segment === 'chats' ? inbox.refetch() : segment === 'following' ? following.refetch() : soulmates.refetch());
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Segments value={segment} onChange={setSegment} badge={inbox.data?.badge ?? 0} />
      {segment === 'chats' ? <ChatInbox onExplore={() => setSegment('people')} /> : null}
      {segment === 'people' ? <SoulmatesAndFriends /> : null}
      {/* Siguiendo: creadores y amigos juntos; debajo, solicitudes, contactos y bloqueos. */}
      {segment === 'following' ? (
        <>
          <FollowingCard />
          <FriendsCard />
        </>
      ) : null}
    </Screen>
  );
}

function SoulmatesAndFriends() {
  const { t } = useTranslation();
  const soulmates = useSoulmates();
  const router = useRouter();
  // Sin almas gemelas, invitar es lo primero; con ellas, la lista manda y la invitación queda debajo.
  const hasSoulmates = Boolean(soulmates.data?.items.length);
  const c = usePalette();
  const [top, ...rest] = soulmates.data?.items ?? [];
  return (
    <>
      {!hasSoulmates ? <InviteCard /> : null}
      {soulmates.isLoading ? <Loading /> : null}
      {soulmates.error ? <ErrorCard error={soulmates.error} onRetry={() => void soulmates.refetch()} /> : null}
      {soulmates.data && !soulmates.data.items.length ? (
        <Card>
          <Title>{t('people.soulmates')}</Title>
          <EmptyState icon="account-heart-outline" title={t('people.soulmatesEmptyTitle')} body={t('people.soulmatesEmpty')} action={{ label: t('people.connectSources'), icon: 'link-variant', onPress: () => router.push('/profile') }} />
        </Card>
      ) : null}
      {top ? <SoulmateHero person={top} /> : null}
      {soulmates.data && rest.length ? (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm, marginBottom: spacing.xs }}>
            <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4 }}>
              {t('people.moreSoulmates')}
            </Text>
            <Small>{t('people.soulmatesCount', { count: soulmates.data.items.length, limit: soulmates.data.limit })}</Small>
          </View>
          {rest.map((p) => (
            <SoulmateRow key={p.userId} person={p} />
          ))}
        </View>
      ) : null}
      {top ? <Small>{t('people.affinityHint')}</Small> : null}
      {hasSoulmates ? <InviteCard /> : null}
    </>
  );
}
