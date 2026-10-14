import type { SoulmateDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSoulmates } from '../../src/api/queries';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Badge, Body, Card, ErrorCard, Loading, PendingNotice, Screen, Small, Title } from '../../src/components/ui';
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

/** People: Top 50 almas gemelas (afinidad real calculada en segundo plano) y amigos (fase 10). */
export default function PeopleScreen() {
  const { t } = useTranslation();
  const soulmates = useSoulmates();
  return (
    <Screen refreshing={soulmates.isRefetching} onRefresh={() => void soulmates.refetch()}>
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
      <Card>
        <Title>{t('people.friends')}</Title>
        <PendingNotice phase="10" text={t('people.friendsPending')} />
      </Card>
    </Screen>
  );
}
