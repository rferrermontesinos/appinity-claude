import type { PublicPersonDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { useSocialAction, type SocialAction } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { Badge, Body, Button, Card, ErrorCard, Small } from './ui';

const REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'] as const;

/**
 * Amistad, bloqueo y reporte desde el perfil (§4 y §16). Las confirmaciones van en la propia pantalla (sin alertas
 * nativas, que en la web no aparecen). Tras bloquear, la persona deja de verse y se vuelve atrás.
 */
export function PersonActions({ person }: { person: PublicPersonDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const action = useSocialAction();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [reported, setReported] = useState(false);
  const { state, requestId } = person.friendship;
  const run = (a: SocialAction, after?: () => void) => action.mutate(a, { onSuccess: after });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/people'));

  return (
    <Card>
      {action.error ? <ErrorCard error={action.error} /> : null}
      {person.creator.public ? <Badge label={person.creator.verified ? t('follow.verifiedCreator') : t('follow.creator')} color={c.accent} /> : null}
      {/* Seguir (2026-10-26): solo creadores con perfil público o amigos. Seguir no cambia tus gustos. */}
      {person.follow.canFollow ? (
        person.follow.state === 'following' ? (
          <Button label={t('follow.following')} icon="account-check" variant="secondary" onPress={() => run({ kind: 'unfollow', userId: person.userId })} disabled={action.isPending} />
        ) : (
          <Button label={t('follow.follow')} icon="account-star" onPress={() => run({ kind: 'follow', userId: person.userId })} loading={action.isPending} />
        )
      ) : null}
      {state === 'none' ? <Button label={t('people.addFriend')} icon="account-plus" onPress={() => run({ kind: 'request', userId: person.userId })} loading={action.isPending} /> : null}
      {state === 'pending_out' ? (
        <View style={{ gap: spacing.xs }}>
          <Badge label={t('people.requestSent')} color={c.textMuted} />
          <Button label={t('people.cancelRequest')} variant="secondary" onPress={() => run({ kind: 'remove', userId: person.userId })} disabled={action.isPending} />
        </View>
      ) : null}
      {state === 'pending_in' && requestId ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label={t('people.acceptRequest')} icon="account-check" onPress={() => run({ kind: 'accept', requestId })} disabled={action.isPending} />
          <Button label={t('people.reject')} variant="secondary" onPress={() => run({ kind: 'reject', requestId })} disabled={action.isPending} />
        </View>
      ) : null}
      {state === 'friends' ? (
        <View style={{ gap: spacing.xs }}>
          <Badge label={t('people.friendsLabel')} color={c.ok} />
          <Button label={t('people.removeFriend')} variant="secondary" onPress={() => run({ kind: 'remove', userId: person.userId })} disabled={action.isPending} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
        <Button label={t('people.block')} icon="block-helper" variant="secondary" onPress={() => setConfirmBlock((v) => !v)} />
        <Button label={t('people.report')} icon="flag-outline" variant="secondary" onPress={() => setReporting((v) => !v)} />
      </View>
      {confirmBlock ? (
        <View style={{ gap: spacing.xs }}>
          <Body>{t('people.blockConfirm')}</Body>
          <Button label={t('people.confirm')} onPress={() => run({ kind: 'block', userId: person.userId }, leave)} loading={action.isPending} />
        </View>
      ) : null}
      {reporting && !reported ? (
        <View style={{ gap: spacing.xs }}>
          <Small style={{ fontWeight: '700' }}>{t('people.reportReasonTitle')}</Small>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Body>{t('people.reportAndBlock')}</Body>
            <Switch value={alsoBlock} onValueChange={setAlsoBlock} accessibilityLabel={t('people.reportAndBlock')} />
          </View>
          {REASONS.map((reason) => (
            <Button
              key={reason}
              label={t(`people.reasons.${reason}`)}
              variant="secondary"
              disabled={action.isPending}
              onPress={() =>
                run({ kind: 'report', userId: person.userId, reason, block: alsoBlock }, () => {
                  setReported(true);
                  if (alsoBlock) leave();
                })
              }
            />
          ))}
        </View>
      ) : null}
      {reported ? <Small style={{ color: c.ok, fontWeight: '700' }}>{t('people.reportSent')}</Small> : null}
    </Card>
  );
}
