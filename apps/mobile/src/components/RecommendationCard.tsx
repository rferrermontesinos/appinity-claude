import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type RecommendationDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { contextLine } from '../catalog/contextLine';
import { fonts, motion, onImage, radius, spacing, usePalette } from '../theme';
import { mixHex } from './Aura';
import { CatalogImage } from './CatalogImage';

/** A partir de esta distancia, soltar la tarjeta cuenta como deslizar (izquierda: descartar; derecha: conservar). */
const SWIPE_THRESHOLD = 110;

/** Motivo breve derivado de evidencia real (§2): nunca un porcentaje «Para ti» sin calibrar. */
export function reasonText(t: (key: string, options?: Record<string, unknown>) => string, r: RecommendationDto): string {
  // Motivo combinado: alguien a quien sigues también lo adora («A Rosalía, a quien sigues, y a 34 de tus almas gemelas…»).
  const followed = r.reason.followedBy
    ? r.reason.followedBy.count > 1
      ? t('home.followedNames', { name: r.reason.followedBy.names[0], count: r.reason.followedBy.count - 1 })
      : r.reason.followedBy.names[0]
    : null;
  switch (r.reason.code) {
    case 'consensus':
      return followed
        ? t('home.reasonConsensusFollowed', { name: followed, count: r.reason.supporters ?? 0 })
        : t('home.reasonConsensus', { count: r.reason.supporters ?? 0 });
    case 'discovery': {
      const name = r.reason.contributor?.displayName ?? '—';
      const discovered = r.reason.contributorFollowed ? t('home.reasonDiscoveryByFollowed', { name }) : t('home.reasonDiscovery', { name });
      return followed ? t('home.reasonAlsoFollowed', { reason: discovered, followed }) : discovered;
    }
    case 'followed':
      return followed
        ? t('home.reasonFollowedMore', { name: r.reason.contributor?.displayName ?? '—', followed })
        : t('home.reasonFollowed', { name: r.reason.contributor?.displayName ?? '—' });
    case 'trending':
      return t('home.reasonTrending', { count: r.reason.positiveVoters ?? 0 });
    case 'content':
      return t(`home.reasonContent.${r.reason.because?.relation ?? 'other'}`, { title: r.reason.because?.title ?? '—', defaultValue: t('home.reasonContent.other', { title: r.reason.because?.title ?? '—' }) });
    case 'community':
      return t('home.reasonCommunity', { count: r.reason.supporters ?? 0 });
    case 'kept':
      return t('home.reasonKept');
    case 'explore':
      return t('home.reasonExplore');
  }
}

export const REASON_ICON = {
  consensus: 'account-group',
  discovery: 'account-heart',
  followed: 'account-star',
  trending: 'map-marker-radius',
  content: 'link-variant',
  community: 'account-multiple-outline',
  kept: 'heart-outline',
  explore: 'compass-outline',
} as const;

/** Motivos que vienen de personas (almas gemelas o comunidad): su icono va en lima. */
export function isPeopleReason(r: RecommendationDto): boolean {
  return r.reason.code === 'consensus' || r.reason.code === 'discovery' || r.reason.code === 'followed' || r.reason.code === 'community';
}

export function RecommendationCard({
  recommendation,
  onDismiss,
  onKeep,
  interactive,
}: {
  recommendation: RecommendationDto;
  onDismiss: () => void;
  onKeep: () => void;
  /** Solo la tarjeta de arriba responde a gestos. */
  interactive: boolean;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const { item } = recommendation;
  const meta = CATEGORY_META[item.category];
  // Una tarjeta por objeto (key = id): el valor animado nace en 0 con cada tarjeta nueva.
  const [x] = useState(() => new Animated.Value(0));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => interactive && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => x.setValue(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dx < -SWIPE_THRESHOLD) Animated.timing(x, { toValue: -500, duration: 160, useNativeDriver: false }).start(onDismiss);
          else if (g.dx > SWIPE_THRESHOLD) Animated.timing(x, { toValue: 500, duration: 160, useNativeDriver: false }).start(onKeep);
          else Animated.spring(x, { toValue: 0, ...motion.spring, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [interactive, onDismiss, onKeep, x],
  );
  const rotate = x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
  const router = useRouter();
  const context = contextLine(item);

  // «Aura» (docs/design/aura/): portada arriba (imagen o portada generada) y panel de texto debajo, sobre superficie
  // (el texto nunca va sobre el halo ni sobre la imagen). La tarjeta brilla con el color de la categoría.
  const peopleReason = isPeopleReason(recommendation);
  return (
    <Animated.View
      {...(interactive ? responder.panHandlers : {})}
      accessibilityLabel={`${item.title}. ${t(`categories.${item.category}`)}. ${reasonText(t, recommendation)}`}
      style={{
        transform: [{ translateX: x }, { rotate }],
        width: '100%',
        borderRadius: radius.xl,
        overflow: 'hidden',
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.hairline,
        boxShadow: `0px 24px 60px -24px ${meta.color}B3`,
      }}
    >
      <View style={{ width: '100%', aspectRatio: 1.3 }}>
        <CatalogImage image={item.primaryImage} category={item.category} title={item.title} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: onImage.glass, borderRadius: radius.full, paddingVertical: 6, paddingLeft: spacing.sm, paddingRight: spacing.md }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color }} />
            <MaterialCommunityIcons name={meta.icon as never} size={15} color={onImage.text} />
            <Text style={{ color: onImage.text, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t(`categories.${item.category}`)}</Text>
          </View>
          {recommendation.isNew ? (
            <View style={{ backgroundColor: c.secondary, borderRadius: radius.full, paddingHorizontal: spacing.sm, justifyContent: 'center' }}>
              <Text style={{ color: c.onSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{t('home.new')}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.lg + 2, paddingTop: spacing.lg, paddingBottom: spacing.xs, gap: spacing.xs }}>
        <Text style={{ color: c.text, fontSize: 28, lineHeight: 30, fontFamily: fonts.displayHeavy, letterSpacing: -0.7 }} numberOfLines={2}>
          {item.title}
        </Text>
        {context ? (
          <Text style={{ color: c.textMuted, fontSize: 14 }} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, backgroundColor: c.surfaceRaised, borderRadius: radius.lg, padding: spacing.md }}>
          {recommendation.reason.code === 'trending' ? (
            <View style={{ borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: mixHex(meta.color, c.surfaceRaised, 0.7) }}>
              <Text style={{ color: c.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{t('home.trendingTag')}</Text>
            </View>
          ) : (
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }}>
              <MaterialCommunityIcons name={REASON_ICON[recommendation.reason.code]} size={18} color={peopleReason ? c.affinity : c.textMuted} />
            </View>
          )}
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 19, flexShrink: 1 }}>{reasonText(t, recommendation)}</Text>
        </View>
        {/* La ficha reúne los enlaces externos; aquí, una acción clara y con área táctil de 48 dp. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.openItem', { title: item.title })}
          onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 48 }}
        >
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{t('home.viewDetails')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={c.text} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
