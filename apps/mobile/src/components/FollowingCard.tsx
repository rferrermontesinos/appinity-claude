import type { FollowedPersonDto, FriendDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useFollowing, useFriends, useSocialAction } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { PersonAvatar, formatAffinity } from './PersonAvatar';
import { Badge, Body, Button, Card, EmptyState, ErrorCard, Loading, Skeleton, Small, Title } from './ui';

function Row({ person, badge, children }: { person: FollowedPersonDto | FriendDto; badge?: { label: string; color: string } | null; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const value = formatAffinity(person.affinity);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={person.displayName}
        onPress={() => router.push(`/person/${person.userId}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
      >
        <PersonAvatar name={person.displayName} url={person.avatarUrl} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>
            {person.displayName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
            {badge ? <Badge label={badge.label} color={badge.color} /> : null}
            <Small>
              {t('people.affinity')}: {value === null ? '—' : t('people.affinityValue', { value })}
            </Small>
          </View>
        </View>
      </Pressable>
      {children}
    </View>
  );
}

/**
 * Siguiendo (2026-10-26): creadores y amigos en una misma lista, como en otras redes. Sus gustos fuertes forman un
 * bloque propio de Inicio y enriquecen el motivo de las demás tarjetas; las almas gemelas siguen siendo el motor.
 */
export function FollowingCard() {
  const { t } = useTranslation();
  const c = usePalette();
  const following = useFollowing();
  const friends = useFriends();
  const action = useSocialAction();
  const followedIds = new Set((following.data ?? []).map((p) => p.userId));
  const notFollowedFriends = (friends.data?.friends ?? []).filter((f) => !followedIds.has(f.userId));
  const badgeOf = (p: FollowedPersonDto) =>
    p.creator ? { label: p.verified ? t('follow.verifiedCreator') : t('follow.creator'), color: c.accent } : { label: t('follow.friend'), color: c.ok };

  return (
    <Card>
      <Title>{t('follow.title')}</Title>
      <Small>{t('follow.intro')}</Small>
      {following.isLoading ? <Skeleton rows={2} height={64} /> : null}
      {following.error ? <ErrorCard error={following.error} onRetry={() => void following.refetch()} /> : null}
      {action.error ? <ErrorCard error={action.error} /> : null}
      {following.data && !following.data.length ? <EmptyState icon="account-star-outline" title={t('follow.emptyTitle')} body={t('follow.empty')} /> : null}
      {following.data?.map((p) => (
        <Row key={p.userId} person={p} badge={badgeOf(p)}>
          <Button label={t('follow.unfollow')} variant="secondary" size="small" onPress={() => action.mutate({ kind: 'unfollow', userId: p.userId })} disabled={action.isPending} />
        </Row>
      ))}
      {notFollowedFriends.length ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          <Small style={{ fontWeight: '700' }}>{t('follow.friendsNotFollowed')}</Small>
          {notFollowedFriends.map((p) => (
            <Row key={p.userId} person={p} badge={{ label: t('follow.friend'), color: c.ok }}>
              <Button label={t('follow.follow')} size="small" onPress={() => action.mutate({ kind: 'follow', userId: p.userId })} disabled={action.isPending} />
            </Row>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
