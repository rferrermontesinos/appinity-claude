import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type AffinityCategoryDto, type SoulmateDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { usePerson } from '../api/queries';
import { fonts, radius, spacing, usePalette } from '../theme';
import { AuraCard, onPoster } from './Aura';
import { PersonAvatar, formatAffinity } from './PersonAvatar';

const HERO_TEXT = onPoster.text;
const HERO_MUTED = onPoster.muted;
const LIME = onPoster.lime;

/** Cifra que cuenta hasta su valor al aparecer (se omite con «reducir movimiento»). */
function useCountUp(target: number | null, reduce: boolean): number | null {
  const [n, setN] = useState(reduce || target === null ? target : 0);
  useEffect(() => {
    if (reduce || target === null) return;
    const started = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / 900);
      setN(Math.round(target * (1 - (1 - t) ** 3)));
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target, reduce]);
  return reduce ? target : n;
}

function HeroBar({ item, reduce }: { item: AffinityCategoryDto; reduce: boolean }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[item.category];
  const value = formatAffinity(item.score);
  const [grow] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (!reduce) Animated.spring(grow, { toValue: 1, friction: 7, tension: 40, useNativeDriver: false }).start();
  }, [grow, reduce]);
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(2, Math.min(100, item.score ?? 0))}%`] });
  return (
    <View
      accessibilityLabel={`${t(`categories.${item.category}`)}: ${value === null ? t('people.noData') : t('people.affinityValue', { value })}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <MaterialCommunityIcons name={meta.icon as never} size={18} color={HERO_TEXT} />
      <Text style={{ color: HERO_TEXT, fontSize: 13, width: 84 }} numberOfLines={1}>
        {t(`categories.${item.category}`)}
      </Text>
      <View style={{ flex: 1, height: 8, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
        {item.score !== null ? <Animated.View style={{ width, height: '100%', borderRadius: radius.full, backgroundColor: meta.color }} /> : null}
      </View>
      <Text style={{ width: 30, textAlign: 'right', color: value === null ? HERO_MUTED : HERO_TEXT, fontFamily: fonts.display, fontSize: 14 }}>{value ?? '—'}</Text>
    </View>
  );
}

/**
 * Momento «Wrapped» de Personas («Aura»): tu alma gemela más cercana con la cifra enorme, sus categorías más afines y
 * cuántos gustos compartís (solo el recuento, nunca cuáles). La afinidad es direccional: se avisa de que la suya hacia
 * ti puede ser distinta. Todo sale del cálculo real (`/v1/people/:id`); sin datos, «—».
 */
export function SoulmateHero({ person }: { person: SoulmateDto }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const reduce = useReducedMotion();
  const detail = usePerson(person.userId);
  const affinity = detail.data?.affinity;
  const score = affinity?.score ?? person.score;
  const shown = useCountUp(score === null ? null : Math.round(score), reduce);
  const top = (affinity?.categories ?? []).filter((x) => x.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3);
  const common = (affinity?.categories ?? []).reduce((sum, x) => sum + x.commonItems, 0);
  const accent = top[0] ? CATEGORY_META[top[0].category].color : c.accent;
  const version = affinity?.algorithmVersion;

  return (
    <AuraCard accent={accent}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <PersonAvatar name={person.displayName} url={person.avatarUrl} size={36} ring={LIME} />
        <Text style={{ color: HERO_TEXT, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
          <Text style={{ fontWeight: '700' }}>{t('people.heroWith', { name: person.displayName })}</Text>
          {person.countryCode ? <Text style={{ color: HERO_MUTED }}> · {person.countryCode}</Text> : null}
        </Text>
      </View>

      <Text style={{ color: LIME, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: spacing.md }}>{t('people.heroKicker')}</Text>
      <Text
        accessibilityLabel={`${t('people.affinity')} ${score === null ? '—' : t('people.affinityValue', { value: Math.round(score) })}`}
        style={{ color: HERO_TEXT, fontFamily: fonts.displayHeavy, fontSize: 64, lineHeight: 66, letterSpacing: -2.5, includeFontPadding: false }}
      >
        {shown === null ? '—' : shown}
        {shown !== null ? <Text style={{ fontSize: 26, letterSpacing: 0 }}> %</Text> : null}
      </Text>
      {person.exceptionalMutual ? (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIME, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 }}>
          <MaterialCommunityIcons name="star-four-points" size={14} color="#141A02" />
          <Text style={{ color: '#141A02', fontSize: 12, fontWeight: '700' }}>{t('people.exceptionalMutual')}</Text>
        </View>
      ) : null}
      <Text style={{ color: HERO_MUTED, fontSize: 12, lineHeight: 17 }}>
        {t('people.heroVersion', { version: version ?? '—', name: person.displayName })}
      </Text>

      {top.length ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {top.map((item) => (
            <HeroBar key={item.category} item={item} reduce={reduce} />
          ))}
        </View>
      ) : null}
      {common > 0 ? <Text style={{ color: HERO_TEXT, fontSize: 14, fontWeight: '600', marginTop: spacing.sm }}>{t('people.heroCommon', { count: common })}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('people.openProfile', { name: person.displayName })}
        onPress={() => router.push(`/person/${person.userId}`)}
        style={({ pressed }) => ({
          marginTop: spacing.md,
          minHeight: 48,
          borderRadius: radius.full,
          backgroundColor: LIME,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <Text style={{ color: '#141A02', fontSize: 15, fontWeight: '700' }}>{t('people.heroCta')}</Text>
        <MaterialCommunityIcons name="arrow-right" size={18} color="#141A02" />
      </Pressable>
    </AuraCard>
  );
}
