import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, isCategory, type MeDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useConnections, useItemProfiles, useSoulmates } from '../api/queries';
import { fonts, radius, spacing, usePalette } from '../theme';
import { AuraCard, onPoster } from './Aura';
import { PersonAvatar } from './PersonAvatar';
import { tasteSummary } from './TastesCard';

function Stat({ value, label, people }: { value: number | null; label: string; people?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: people ? onPoster.lime : onPoster.text, fontFamily: fonts.displayHeavy, fontSize: 28, letterSpacing: -0.8 }}>{value ?? '—'}</Text>
      <Text style={{ color: onPoster.muted, fontSize: 12, lineHeight: 15 }}>{label}</Text>
    </View>
  );
}

/**
 * Cabecera de Perfil («Aura»): tu cartel. Avatar con aro lima, nombre y @usuario, y tres cifras reales (fuentes
 * activas, gustos claros y almas gemelas). Se tiñe con la categoría más presente en tus gustos; sin gustos, con la
 * chispa, y lo dice.
 */
export function ProfileHero({ me }: { me: MeDto }) {
  const { t } = useTranslation();
  const c = usePalette();
  const profiles = useItemProfiles();
  const connections = useConnections();
  const soulmates = useSoulmates();
  const summary = profiles.data ? tasteSummary(profiles.data) : null;
  const top = summary ? [...summary.byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
  const topCategory = top && isCategory(top) ? top : null;
  const accent = topCategory ? CATEGORY_META[topCategory].color : c.accent;
  const active = connections.data ? connections.data.filter((x) => x.status === 'active').length : null;
  return (
    <AuraCard accent={accent} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PersonAvatar name={me.user.displayName} url={null} size={64} ring={onPoster.lime} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ color: onPoster.text, fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 31, letterSpacing: -0.8 }} numberOfLines={2}>
            {me.user.displayName}
          </Text>
          <Text style={{ color: onPoster.muted, fontSize: 14 }} numberOfLines={1}>
            @{me.user.handle}
            {me.user.countryCode ? ` · ${me.user.countryCode}` : ''}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
        <Stat value={active} label={t('profile.heroSources')} />
        <Stat value={summary?.likes ?? null} label={t('profile.heroLikes')} />
        <Stat value={soulmates.data?.items.length ?? null} label={t('profile.heroSoulmates')} people />
      </View>
      {topCategory ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(12,12,14,0.45)', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 6 }}>
          <MaterialCommunityIcons name={CATEGORY_META[topCategory].icon as never} size={15} color={onPoster.text} />
          <Text style={{ color: onPoster.text, fontSize: 12, fontWeight: '600' }}>{t('profile.heroTop', { category: t(`categories.${topCategory}`) })}</Text>
        </View>
      ) : summary && summary.total === 0 ? (
        <Text style={{ color: onPoster.muted, fontSize: 13 }}>{t('profile.heroEmpty')}</Text>
      ) : null}
    </AuraCard>
  );
}
