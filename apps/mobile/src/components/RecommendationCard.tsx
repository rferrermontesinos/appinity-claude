import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type RecommendationDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, Text, View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { contextLine } from '../catalog/contextLine';
import { fonts, motion, onImage, radius, spacing, usePalette } from '../theme';
import { mixHex } from './Aura';
import { CatalogImage } from './CatalogImage';
import { VOTE_LEVELS, VoteStamp, type CardZone } from './Vote';

/**
 * Gestos de la tarjeta (modelo binario + «Me encanta», 2026-10-27): derecha «Me gusta», izquierda «No me gusta», doble
 * toque «Me encanta» (como en Instagram), arriba «Guardar», abajo «Paso». Cada dirección es una sola decisión: no hay
 * que medir distancias. Pasado el umbral se ve el sello; volver al centro y soltar cancela.
 */
const THRESHOLD = 100;
const DOUBLE_TAP_MS = 280;

function zoneOf(dx: number, dy: number): CardZone | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > ax) {
    if (dy <= -THRESHOLD) return { kind: 'save' };
    if (dy >= THRESHOLD) return { kind: 'pass' };
    return null;
  }
  if (ax < THRESHOLD) return null;
  return { kind: 'vote', value: dx > 0 ? 1 : -1 };
}
const sameZone = (a: CardZone | null, b: CardZone | null) =>
  a?.kind === b?.kind && (a?.kind !== 'vote' || (b?.kind === 'vote' && a.value === b.value));

/** Historial de toques que el sistema de respuesta añade a cada evento (los tipos de React Native no lo declaran). */
type TouchRecord = { startPageX: number; startPageY: number; currentPageX: number; currentPageY: number };
const touchHistory = (e: GestureResponderEvent) =>
  (e as GestureResponderEvent & { touchHistory: { touchBank: Array<TouchRecord | undefined>; indexOfSingleActiveTouch: number; mostRecentTimeStamp: number } }).touchHistory;

/** Lo que pueden pedir los botones de debajo: la tarjeta sale con la misma animación y el mismo sello que el gesto. */
export interface RecommendationCardHandle {
  fling: (action: CardZone) => void;
}

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
  kept: 'bookmark-outline',
  explore: 'compass-outline',
} as const;

/** Motivos que vienen de personas (almas gemelas o comunidad): su icono va en lima. */
export function isPeopleReason(r: RecommendationDto): boolean {
  return r.reason.code === 'consensus' || r.reason.code === 'discovery' || r.reason.code === 'followed' || r.reason.code === 'community';
}


export function RecommendationCard({
  recommendation,
  onAction,
  interactive,
  ref,
}: {
  recommendation: RecommendationDto;
  /** Votar, guardar o pasar (después de la animación de salida). */
  onAction: (action: CardZone) => void;
  /** Solo la tarjeta de arriba responde a gestos. */
  interactive: boolean;
  ref?: Ref<RecommendationCardHandle>;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const reduceMotion = useReducedMotion();
  const { item } = recommendation;
  const meta = CATEGORY_META[item.category];
  // Una tarjeta por objeto (key = id): los valores animados nacen en 0 con cada tarjeta nueva.
  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  const [zone, setZone] = useState<CardZone | null>(null);
  const zoneRef = useRef<CardZone | null>(null);
  const lastTap = useRef(0);
  const leaving = useRef(false);
  const router = useRouter();
  const openDetails = () => router.push({ pathname: '/item/[id]', params: { id: item.id } });

  const fling = (action: CardZone) => {
    if (leaving.current) return;
    leaving.current = true;
    zoneRef.current = null;
    setZone(action);
    // Una sola vez: al acabar la animación o, si no llega a acabar (app en segundo plano, animaciones en pausa), por
    // tiempo; la acción no se pierde.
    let sent = false;
    const done = () => {
      if (sent) return;
      sent = true;
      onAction(action);
    };
    // Sin animación si el sistema pide reducir movimiento: el sello se ve un instante y la tarjeta se va.
    if (reduceMotion) {
      setTimeout(done, 250);
      return;
    }
    setTimeout(done, 1200);
    const to = (v: Animated.Value, toValue: number, delay = 0) =>
      Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue, duration: 200, useNativeDriver: false })]);
    // «Me encanta» y «Guardar» enseñan el sello un momento antes de salir (no hay arrastre previo que lo muestre).
    const anim =
      action.kind === 'save'
        ? to(y, -900, 260)
        : action.kind === 'pass'
          ? to(y, 900)
          : to(x, Math.sign(action.value) * 600, action.value === 2 ? 320 : 0);
    anim.start(done);
  };
  useImperativeHandle(ref, () => ({ fling }));

  // Gesto con el sistema de respuesta táctil de la vista (props JSX: solo se ejecutan en eventos, nunca en el render).
  // Desplazamiento desde donde empezó el dedo, según el historial de toques del sistema de respuesta (el mismo que usa
  // PanResponder; igual en Android, iOS y web). Sin datos fiables, cuenta como «no se ha movido».
  const delta = (e: GestureResponderEvent) => {
    const { touchBank, indexOfSingleActiveTouch } = touchHistory(e);
    const t = touchBank[indexOfSingleActiveTouch] ?? touchBank.find(Boolean);
    const dx = t ? t.currentPageX - t.startPageX : 0;
    const dy = t ? t.currentPageY - t.startPageY : 0;
    return Number.isFinite(dx) && Number.isFinite(dy) ? { dx, dy } : { dx: 0, dy: 0 };
  };
  const reset = () => {
    zoneRef.current = null;
    setZone(null);
    Animated.parallel([
      Animated.spring(x, { toValue: 0, ...motion.spring, useNativeDriver: false }),
      Animated.spring(y, { toValue: 0, ...motion.spring, useNativeDriver: false }),
    ]).start();
  };
  const gesture = {
    // Se queda el toque desde el principio: doble toque y gestos verticales sin que la página se desplace.
    onStartShouldSetResponder: () => !leaving.current,
    onMoveShouldSetResponder: (e: GestureResponderEvent) => {
      const { dx, dy } = delta(e);
      return !leaving.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8);
    },
    // true: el desplazamiento nativo de la página no puede quitarle el gesto a la tarjeta.
    onResponderGrant: () => true,
    onResponderTerminationRequest: () => false,
    onResponderMove: (e: GestureResponderEvent) => {
      const { dx, dy } = delta(e);
      const vertical = Math.abs(dy) > Math.abs(dx);
      x.setValue(vertical ? dx * 0.25 : dx);
      y.setValue(vertical ? dy : dy * 0.25);
      const z = zoneOf(dx, dy);
      if (!sameZone(z, zoneRef.current)) {
        zoneRef.current = z;
        setZone(z);
      }
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const { dx, dy } = delta(e);
      const z = zoneOf(dx, dy);
      if (z) return fling(z);
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        const now = touchHistory(e).mostRecentTimeStamp;
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          return fling({ kind: 'vote', value: 2 });
        }
        lastTap.current = now;
      }
      reset();
    },
    onResponderTerminate: reset,
  };

  const rotate = x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
  // El tinte crece hacia el umbral: coral a la izquierda, lima a la derecha, claro arriba (guardar), oscuro abajo (paso).
  const negTint = x.interpolate({ inputRange: [-THRESHOLD, -THRESHOLD / 3, 0], outputRange: [0.32, 0, 0], extrapolate: 'clamp' });
  const posTint = x.interpolate({ inputRange: [0, THRESHOLD / 3, THRESHOLD], outputRange: [0, 0, 0.3], extrapolate: 'clamp' });
  const upTint = y.interpolate({ inputRange: [-THRESHOLD, -THRESHOLD / 3, 0], outputRange: [0.18, 0, 0], extrapolate: 'clamp' });
  const downTint = y.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 0.45], extrapolate: 'clamp' });
  const context = contextLine(item);

  // Lector de pantalla: la tarjeta es un solo elemento con acciones (votar, guardar, paso; activar abre la ficha).
  const actions = [
    ...VOTE_LEVELS.map((l) => ({ name: `vote${l.value}`, label: t(`home.vote.${l.key}`) })),
    { name: 'save', label: t('home.vote.save') },
    { name: 'pass', label: t('home.vote.pass') },
    { name: 'activate', label: t('home.viewDetails') },
  ];
  const onA11yAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate') return openDetails();
    if (name === 'save' || name === 'pass') return fling({ kind: name });
    const level = VOTE_LEVELS.find((l) => `vote${l.value}` === name);
    if (level) fling({ kind: 'vote', value: level.value });
  };

  // «Aura» (docs/design/aura/): portada arriba (imagen o portada generada) y panel de texto debajo, sobre superficie
  // (el texto nunca va sobre el halo ni sobre la imagen). La tarjeta brilla con el color de la categoría.
  const peopleReason = isPeopleReason(recommendation);
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
  return (
    <Animated.View
      {...(interactive ? gesture : {})}
      accessible={interactive}
      accessibilityLabel={`${item.title}. ${t(`categories.${item.category}`)}. ${reasonText(t, recommendation)}`}
      accessibilityHint={interactive ? t('home.cardHint') : undefined}
      accessibilityActions={interactive ? actions : undefined}
      onAccessibilityAction={interactive ? onA11yAction : undefined}
      style={{
        transform: [{ translateX: x }, { translateY: y }, { rotate }],
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
        <CatalogImage image={item.primaryImage} category={item.category} title={item.title} style={fill} />
        <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: onImage.glass, borderRadius: radius.full, paddingVertical: 6, paddingLeft: spacing.sm, paddingRight: spacing.md }}>
            <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: meta.color }} />
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
          onPress={openDetails}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 48 }}
        >
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{t('home.viewDetails')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={c.text} />
        </Pressable>
      </View>
      {/* Tintes del gesto y sello del voto, por encima de todo y sin recibir toques. */}
      <Animated.View pointerEvents="none" style={[fill, { backgroundColor: c.negative, opacity: negTint }]} />
      <Animated.View pointerEvents="none" style={[fill, { backgroundColor: c.affinity, opacity: posTint }]} />
      <Animated.View pointerEvents="none" style={[fill, { backgroundColor: c.text, opacity: upTint }]} />
      <Animated.View pointerEvents="none" style={[fill, { backgroundColor: c.auraBase, opacity: downTint }]} />
      {zone ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: 1.3, alignItems: 'center', justifyContent: 'center' }}>
          <VoteStamp zone={zone} />
        </View>
      ) : null}
    </Animated.View>
  );
}
