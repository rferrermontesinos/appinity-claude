import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type RecommendationDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { contextLine } from '../catalog/contextLine';
import { fonts, onImage, radius, spacing, usePalette } from '../theme';
import { CatalogImage } from './CatalogImage';
import { ImageVeil } from './ImageVeil';

/** A partir de esta distancia, soltar la tarjeta cuenta como deslizar (izquierda: descartar; derecha: conservar). */
const SWIPE_THRESHOLD = 110;

/** Motivo breve derivado de evidencia real (§2): nunca un porcentaje «Para ti» sin calibrar. */
export function reasonText(t: (key: string, options?: Record<string, unknown>) => string, r: RecommendationDto): string {
  switch (r.reason.code) {
    case 'consensus':
      return t('home.reasonConsensus', { count: r.reason.supporters ?? 0 });
    case 'discovery':
      return t('home.reasonDiscovery', { name: r.reason.contributor?.displayName ?? '—' });
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

const REASON_ICON = {
  consensus: 'account-group',
  discovery: 'account-heart',
  trending: 'map-marker-radius',
  content: 'link-variant',
  community: 'account-multiple-outline',
  kept: 'heart-outline',
  explore: 'compass-outline',
} as const;

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
          else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [interactive, onDismiss, onKeep, x],
  );
  const rotate = x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
  const router = useRouter();
  const context = contextLine(item);

  // Sistema de diseño (tarjeta de recomendación): imagen a sangre, velo inferior, categoría y NEW arriba, título en
  // display y el motivo REAL en una cápsula translúcida. El texto va siempre en claro sobre el velo (contraste AA).
  return (
    <Animated.View
      {...(interactive ? responder.panHandlers : {})}
      accessibilityLabel={`${item.title}. ${t(`categories.${item.category}`)}. ${reasonText(t, recommendation)}`}
      style={{
        transform: [{ translateX: x }, { rotate }],
        width: '100%',
        aspectRatio: 0.72,
        borderRadius: radius.xl,
        overflow: 'hidden',
        backgroundColor: c.surfaceAlt,
      }}
    >
      <CatalogImage image={item.primaryImage} category={item.category} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <ImageVeil />
      <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: onImage.glass, borderRadius: radius.full, paddingVertical: 5, paddingLeft: spacing.sm, paddingRight: spacing.md }}>
          <MaterialCommunityIcons name={meta.icon as never} size={16} color={meta.color} />
          <Text style={{ color: onImage.text, fontSize: 12, fontWeight: '600' }}>{t(`categories.${item.category}`)}</Text>
        </View>
        {recommendation.isNew ? (
          <View style={{ backgroundColor: c.secondary, borderRadius: radius.full, paddingHorizontal: spacing.sm, justifyContent: 'center' }}>
            <Text style={{ color: c.onSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{t('home.new')}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.xs }}>
        <Text style={{ color: onImage.text, fontSize: 26, lineHeight: 29, fontFamily: fonts.display, letterSpacing: -0.4 }} numberOfLines={2}>
          {item.title}
        </Text>
        {context ? (
          <Text style={{ color: onImage.muted, fontSize: 14 }} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: spacing.sm,
            backgroundColor: onImage.glass,
            borderRadius: radius.md,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          <MaterialCommunityIcons name={REASON_ICON[recommendation.reason.code]} size={18} color={onImage.reasonIcon} />
          <Text style={{ color: onImage.text, fontSize: 13, fontWeight: '500', flexShrink: 1 }}>{reasonText(t, recommendation)}</Text>
        </View>
        {/* La ficha reúne los enlaces externos; aquí, una acción clara y con área táctil de 48 dp. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.openItem', { title: item.title })}
          onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 48 }}
        >
          <Text style={{ color: onImage.text, fontSize: 14, fontWeight: '600' }}>{t('home.viewDetails')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={onImage.text} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
