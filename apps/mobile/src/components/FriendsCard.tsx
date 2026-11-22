import type { FriendDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useBlocked, useFriends, useSocialAction } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { PersonAvatar, formatAffinity } from './PersonAvatar';
import { ContactsFinder } from './ContactsFinder';
import { Body, Button, Card, ErrorCard, Loading, Small, Title } from './ui';

function PersonLine({ person, children }: { person: FriendDto; children?: React.ReactNode }) {
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
        <PersonAvatar name={person.displayName} url={person.avatarUrl} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>
            {person.displayName}
          </Text>
          <Small>
            {t('people.affinity')}: {value === null ? '—' : t('people.affinityValue', { value })}
          </Small>
        </View>
      </Pressable>
      {children}
    </View>
  );
}

/** Amigos (§4): solicitudes, amigos con su afinidad (o «—»), bloqueos y la búsqueda en los contactos. */
export function FriendsCard() {
  const { t } = useTranslation();
  const friends = useFriends();
  const blocked = useBlocked();
  const action = useSocialAction();
  const data = friends.data;
  return (
    <Card>
      <Title>{t('people.friends')}</Title>
      {friends.isLoading ? <Loading /> : null}
      {friends.error ? <ErrorCard error={friends.error} onRetry={() => void friends.refetch()} /> : null}
      {action.error ? <ErrorCard error={action.error} /> : null}
      {data?.incoming.length ? (
        <View style={{ gap: spacing.xs }}>
          <Small style={{ fontWeight: '700' }}>{t('people.incoming')}</Small>
          {data.incoming.map((p) => (
            <PersonLine key={p.userId} person={p}>
              <Button label={t('people.accept')} onPress={() => action.mutate({ kind: 'accept', requestId: p.requestId })} disabled={action.isPending} />
              <Button label={t('people.reject')} variant="secondary" onPress={() => action.mutate({ kind: 'reject', requestId: p.requestId })} disabled={action.isPending} />
            </PersonLine>
          ))}
        </View>
      ) : null}
      {data && !data.friends.length && !data.incoming.length && !data.outgoing.length ? <Body muted>{t('people.friendsEmpty')}</Body> : null}
      {data?.friends.map((p) => <PersonLine key={p.userId} person={p} />)}
      {data?.outgoing.length ? (
        <View style={{ gap: spacing.xs }}>
          <Small style={{ fontWeight: '700' }}>{t('people.outgoing')}</Small>
          {data.outgoing.map((p) => (
            <PersonLine key={p.userId} person={p}>
              <Button label={t('people.cancelRequest')} variant="secondary" onPress={() => action.mutate({ kind: 'remove', userId: p.userId })} disabled={action.isPending} />
            </PersonLine>
          ))}
        </View>
      ) : null}
      <ContactsFinder />
      {blocked.data?.length ? (
        <View style={{ gap: spacing.xs }}>
          <Small style={{ fontWeight: '700' }}>{t('people.blocked')}</Small>
          {blocked.data.map((p) => (
            <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <Body>{p.displayName}</Body>
              <Button label={t('people.unblock')} variant="secondary" onPress={() => action.mutate({ kind: 'unblock', userId: p.userId })} disabled={action.isPending} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
