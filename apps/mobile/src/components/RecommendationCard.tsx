import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type RecommendationDto } from '@appinity/shared';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { radius, spacing, usePalette } from '../theme';
import { CatalogImage } from './CatalogImage';
import { Badge } from './ui';

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
  const link = item.externalLinks.find((l) => l.url.startsWith('https://'));

  return (
    <Animated.View
      {...(interactive ? responder.panHandlers : {})}
      accessibilityLabel={`${item.title}. ${t(`categories.${item.category}`)}. ${reasonText(t, recommendation)}`}
      style={{
        transform: [{ translateX: x }, { rotate }],
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.border,
        overflow: 'hidden',
      }}
    >
      <View>
        <CatalogImage image={item.primaryImage} category={item.category} style={{ width: '100%', aspectRatio: 4 / 3 }} />
        <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, flexDirection: 'row', gap: spacing.xs }}>
          <Badge label={t(`categories.${item.category}`)} color={meta.color} background={c.surface} />
          {recommendation.isNew ? <Badge label={t('home.new')} color={c.accentText} background={c.accent} /> : null}
        </View>
      </View>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <MaterialCommunityIcons name={REASON_ICON[recommendation.reason.code]} size={18} color={c.accent} />
          <Text style={{ color: c.text, fontSize: 15, flexShrink: 1 }}>{reasonText(t, recommendation)}</Text>
        </View>
        {link ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('home.openLink', { provider: link.provider })}
            onPress={() => void WebBrowser.openBrowserAsync(link.url)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}
          >
            <MaterialCommunityIcons name="open-in-new" size={14} color={c.textMuted} />
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{link.provider}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
