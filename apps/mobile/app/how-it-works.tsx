import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TransparencyDto } from '@appinity/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { apiRequest } from '../src/api/client';
import { Card, ErrorCard, Loading, Screen, Small, Title } from '../src/components/ui';
import { spacing, type, usePalette } from '../src/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function Point({ icon, text, color }: { icon: IconName; text: string; color?: string }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <MaterialCommunityIcons name={icon} size={20} color={color ?? c.textMuted} style={{ marginTop: 1 }} />
      <Text style={{ color: c.text, fontSize: 15, lineHeight: 21, flex: 1 }}>{text}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <Title>{title}</Title>
      <View style={{ gap: spacing.md }}>{children}</View>
    </Card>
  );
}

const NEVER_ICON: Record<string, IconName> = {
  photos: 'face-recognition',
  gallery: 'image-off-outline',
  demographics: 'account-question-outline',
  popularity: 'trophy-outline',
  dwellTime: 'timer-off-outline',
  messages: 'message-lock-outline',
};

/**
 * «Cómo funciona APPINITY» (2026-10-27): qué usamos, cómo se calcula y lo que nunca usamos. Las cifras salen del
 * servidor (`/v1/transparency`), de las mismas constantes que el motor: la página no puede contar otra cosa.
 */
export default function HowItWorksScreen() {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const facts = useQuery({ queryKey: ['transparency'], queryFn: () => apiRequest<TransparencyDto>('/v1/transparency'), staleTime: 3_600_000 });
  const f = facts.data;
  const vote = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString(i18n.language)}`;
  return (
    <Screen refreshing={facts.isRefetching} onRefresh={() => void facts.refetch()}>
      <Stack.Screen options={{ title: t('howItWorks.title') }} />
      <Text accessibilityRole="header" style={{ color: c.text, ...type.h2 }}>
        {t('howItWorks.title')}
      </Text>
      <Text style={{ color: c.textMuted, fontSize: 15, lineHeight: 21 }}>{t('howItWorks.intro')}</Text>
      {facts.isLoading ? <Loading /> : null}
      {facts.isError ? <ErrorCard error={facts.error} onRetry={() => void facts.refetch()} /> : null}
      {f ? (
        <>
          <Section title={t('howItWorks.tastes.title')}>
            <Point icon="link-variant" text={t('howItWorks.tastes.sources')} />
            <Point icon="thumbs-up-down-outline" text={t('howItWorks.tastes.votes', { dislike: vote(f.votes.dislike), like: vote(f.votes.like), love: vote(f.votes.love) })} />
            <Point icon="minus-circle-outline" text={t('howItWorks.tastes.neutral')} />
          </Section>

          <Section title={t('howItWorks.soulmates.title')}>
            <Point icon="vector-intersection" text={t('howItWorks.soulmates.compare')} />
            <Point icon="scale-balance" text={t('howItWorks.soulmates.evidence')} />
            <Point icon="swap-horizontal" text={t('howItWorks.soulmates.symmetric')} />
          </Section>

          <Section title={t('howItWorks.recs.title')}>
            <Point icon="account-group-outline" text={t('howItWorks.recs.consensus', { soulmates: f.consensus.soulmates, min: f.consensus.minSupporters })} />
            <Point icon="compass-outline" text={t('howItWorks.recs.discovery', { min: f.discovery.minAffinity })} />
            <Point icon="account-heart-outline" text={t('howItWorks.recs.followed')} />
            <Point icon="map-marker-radius-outline" text={t('howItWorks.recs.trending', { min: f.trending.minVoters })} />
            <Point icon="chart-donut" text={t('howItWorks.recs.mix', f.mix)} />
            <Point icon="lightbulb-outline" text={t('howItWorks.recs.fallback')} />
            <Point icon="history" text={t('howItWorks.recs.voted', { days: f.unknownReturnDays })} />
          </Section>

          <Section title={t('howItWorks.never.title')}>
            {f.neverUsed.map((key) => (
              <Point key={key} icon={NEVER_ICON[key] ?? 'eye-off-outline'} color={c.negative} text={t(`howItWorks.never.${key}`)} />
            ))}
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{t('howItWorks.never.note')}</Text>
          </Section>

          <Section title={t('howItWorks.others.title')}>
            <Point icon="card-account-details-outline" text={t('howItWorks.others.profile')} />
            <Point icon="counter" text={t('howItWorks.others.counts')} />
            <Point icon="vector-link" text={t('howItWorks.others.shared')} />
          </Section>

          <Section title={t('howItWorks.controls.title')}>
            <Point icon="link-variant-off" text={t('howItWorks.controls.sources')} />
            <Point icon="undo" text={t('howItWorks.controls.undo')} />
            <Point icon="incognito" text={t('howItWorks.controls.hide')} />
            <Point icon="delete-outline" text={t('howItWorks.controls.delete')} />
          </Section>

          <Small>{t('howItWorks.versions', { affinity: f.affinityVersion, recommendation: f.recommendationVersion })}</Small>
        </>
      ) : null}
    </Screen>
  );
}
