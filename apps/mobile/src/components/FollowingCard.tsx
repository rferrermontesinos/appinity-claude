import type { FollowedPersonDto, FriendDto } from '@appinity/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useFollowing, useFriends, useSocialAction } from '../api/queries';
import { fonts, spacing, usePalette } from '../theme';
import { AuraCard, onPoster } from './Aura';
import { PersonAvatar, formatAffinity } from './PersonAvatar';
import { Badge, Button, EmptyState, ErrorCard, Skeleton, Small } from './ui';

type Kind = { label: string; color: string };

/** Cifra de afinidad grande, como en las filas de Almas gemelas. */
function AffinityFigure({ value, color, muted, size = 24 }: { value: number | null; color: string; muted: string; size?: number }) {
  const v = formatAffinity(value);
  return (
    <Text style={{ color: v === null ? muted : color, fontFamily: fonts.displayHeavy, fontSize: size, letterSpacing: -0.8 }}>
      {v ?? '—'}
      {v !== null ? <Text style={{ fontSize: 13, color: muted, letterSpacing: 0 }}> %</Text> : null}
    </Text>
  );
}

/** Cartel de la persona que sigues más afín (mismo patrón que el cartel de Almas gemelas). */
function FollowingHero({ person, kind }: { person: FollowedPersonDto; kind: Kind }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${person.displayName}, ${kind.label}, ${t('people.affinity')} ${formatAffinity(person.affinity) ?? '—'}`} onPress={() => router.push(`/person/${person.userId}`)}>
      <AuraCard accent={kind.color} style={{ gap: spacing.md }}>
        <Text style={{ color: onPoster.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('follow.heroKicker')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <PersonAvatar name={person.displayName} url={person.avatarUrl} size={64} ring={onPoster.lime} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text accessibilityRole="header" style={{ color: onPoster.text, fontFamily: fonts.displayHeavy, fontSize: 26, letterSpacing: -0.7 }} numberOfLines={1}>
              {person.displayName}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <Badge label={kind.label} color={onPoster.text} />
            </View>
          </View>
          <AffinityFigure value={person.affinity} color={onPoster.lime} muted={onPoster.muted} size={36} />
        </View>
        <Text style={{ color: onPoster.muted, fontSize: 13 }}>{t('follow.heroHint')}</Text>
      </AuraCard>
    </Pressable>
  );
}

/** Fila de una persona (mismo patrón que las filas de Almas gemelas): avatar con aro, nombre, tipo y afinidad. */
function PersonRow({ person, kind, action }: { person: FollowedPersonDto | FriendDto; kind: Kind; action?: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${person.displayName}, ${kind.label}, ${t('people.affinity')} ${formatAffinity(person.affinity) ?? '—'}`}
        onPress={() => router.push(`/person/${person.userId}`)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}
      >
        <PersonAvatar name={person.displayName} url={person.avatarUrl} size={48} ring />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
            {person.displayName}
          </Text>
          <Small style={{ color: kind.color }}>{kind.label}</Small>
        </View>
        {action ? null : <AffinityFigure value={person.affinity} color={c.text} muted={c.textMuted} />}
        {action ? null : <MaterialCommunityIcons name="chevron-right" size={22} color={c.textSubtle} />}
      </Pressable>
      {action}
    </View>
  );
}

/**
 * Siguiendo (2026-10-27): creadores y amigos juntos, con el mismo formato que Almas gemelas (cartel de la persona
 * más afín y filas). Dejar de seguir se hace desde el perfil de cada persona; aquí, seguir a amigos que aún no sigues.
 */
export function FollowingCard() {
  const { t } = useTranslation();
  const c = usePalette();
  const following = useFollowing();
  const friends = useFriends();
  const action = useSocialAction();
  const followedIds = new Set((following.data ?? []).map((p) => p.userId));
  const notFollowedFriends = (friends.data?.friends ?? []).filter((f) => !followedIds.has(f.userId));
  const kindOf = (p: FollowedPersonDto): Kind =>
    p.creator ? { label: p.verified ? t('follow.verifiedCreator') : t('follow.creator'), color: c.accent } : { label: t('follow.friend'), color: c.ok };
  // La persona más afín arriba; el resto, por afinidad (sin dato, al final).
  const sorted = [...(following.data ?? [])].sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1));
  const [top, ...rest] = sorted;

  if (following.isLoading) return <Skeleton rows={3} height={64} />;
  return (
    <>
      {following.error ? <ErrorCard error={following.error} onRetry={() => void following.refetch()} /> : null}
      {action.error ? <ErrorCard error={action.error} /> : null}
      {following.data && !following.data.length ? <EmptyState icon="account-star-outline" title={t('follow.emptyTitle')} body={t('follow.empty')} /> : null}
      {top ? <FollowingHero person={top} kind={kindOf(top)} /> : null}
      {rest.length ? (
        <View>
          <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, marginTop: spacing.sm, marginBottom: spacing.xs }}>
            {t('follow.more')}
          </Text>
          {rest.map((p) => (
            <PersonRow key={p.userId} person={p} kind={kindOf(p)} />
          ))}
        </View>
      ) : null}
      {notFollowedFriends.length ? (
        <View>
          <Text accessibilityRole="header" style={{ color: c.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, marginTop: spacing.sm, marginBottom: spacing.xs }}>
            {t('follow.friendsNotFollowed')}
          </Text>
          {notFollowedFriends.map((p) => (
            <PersonRow
              key={p.userId}
              person={p}
              kind={{ label: t('follow.friend'), color: c.ok }}
              action={<Button label={t('follow.follow')} size="small" onPress={() => action.mutate({ kind: 'follow', userId: p.userId })} disabled={action.isPending} />}
            />
          ))}
        </View>
      ) : null}
      {following.data?.length ? <Small>{t('follow.intro')}</Small> : null}
    </>
  );
}
