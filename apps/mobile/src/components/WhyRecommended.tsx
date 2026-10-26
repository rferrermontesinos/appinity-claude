import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { RecommendationDto } from '@appinity/shared';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { fonts, radius, spacing, usePalette } from '../theme';
import { CatalogImage } from './CatalogImage';
import { REASON_ICON, isPeopleReason } from './RecommendationCard';

export interface Stat {
  value: string;
  label: string;
  /** Cifra de personas o afinidad: va en lima. */
  people?: boolean;
}

/** Título del motivo (bloque) con el dato atribuible permitido: el nombre en descubrimiento, el gusto propio en contenido. */
export function blockTitle(t: TFunction, r: RecommendationDto): string {
  return t(`categoriesScreen.why.${r.reason.code}`, { name: r.reason.contributor?.displayName ?? '—', title: r.reason.because?.title ?? '—' });
}

/** Cifras que justifican el puesto, a partir del desglose real del servidor (agregados; ninguna inventada). */
export function evidenceStats(t: TFunction, r: RecommendationDto): Stat[] {
  const e = r.reason.evidence;
  const out: Stat[] = [];
  switch (r.reason.code) {
    case 'consensus':
      if (r.reason.supporters !== undefined && r.reason.opinionated) out.push({ value: `${r.reason.supporters}/${r.reason.opinionated}`, label: t('categoriesScreen.why.supporters'), people: true });
      if (e?.likeLevel !== undefined) out.push({ value: String(e.likeLevel), label: t('categoriesScreen.why.likeLevel') });
      if (e?.supporterAffinity !== undefined) out.push({ value: `${e.supporterAffinity} %`, label: t('categoriesScreen.why.affinityMean'), people: true });
      break;
    case 'discovery':
      if (e?.supporterAffinity !== undefined) out.push({ value: `${e.supporterAffinity} %`, label: t('categoriesScreen.why.affinityOne'), people: true });
      if (e?.likeLevel !== undefined) out.push({ value: String(e.likeLevel), label: t('categoriesScreen.why.likeLevelOne') });
      break;
    case 'trending':
      if (r.reason.positiveVoters !== undefined && r.reason.totalVoters) out.push({ value: `${r.reason.positiveVoters}/${r.reason.totalVoters}`, label: t('categoriesScreen.why.areaVoters') });
      if (e?.areaRating !== undefined) out.push({ value: String(e.areaRating), label: t('categoriesScreen.why.areaRating') });
      break;
    case 'community':
      if (r.reason.supporters !== undefined) out.push({ value: String(r.reason.supporters), label: t('categoriesScreen.why.communityVoters') });
      break;
    case 'content':
      if (e?.relatedLikes) out.push({ value: String(e.relatedLikes), label: t('categoriesScreen.why.relatedLikes') });
      break;
    default:
      break;
  }
  return out;
}

/** Tiene motivo con datos (personas, zona o gustos propios); explorar y conservados, no. */
export function hasEvidence(r: RecommendationDto): boolean {
  return r.reason.code !== 'explore' && r.reason.code !== 'kept';
}

/** Línea de pie: puntuación de orden, confianza y, en Trending, radio y año de los votos. */
function scoreLine(t: TFunction, r: RecommendationDto): string | null {
  const e = r.reason.evidence;
  if (!e) return null;
  const parts = [t('categoriesScreen.why.score', { score: e.score })];
  if (e.confidence !== undefined) parts.push(t('categoriesScreen.why.confidence', { confidence: e.confidence }));
  if (e.radiusKm != null && e.year) parts.push(t('categoriesScreen.why.area', { radius: e.radiusKm, year: e.year }));
  return parts.join(' · ');
}

function ExceptionalBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.affinity, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 }}>
      <MaterialCommunityIcons name="star-four-points" size={14} color={c.onAffinity} />
      <Text style={{ color: c.onAffinity, fontSize: 12, fontWeight: '700', flexShrink: 1 }}>{t('categoriesScreen.why.exceptional', { count })}</Text>
    </View>
  );
}

/**
 * Tarjeta de podio (puestos 1–3): portada, puesto en grande, el motivo y sus cifras en casillas. El primero lleva la
 * portada a lo ancho; los siguientes, en miniatura. Así lo mejor valorado pesa más y explica por qué está arriba.
 */
export function PodiumCard({ r, rank }: { r: RecommendationDto; rank: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const stats = evidenceStats(t, r);
  const exceptional = r.reason.evidence?.exceptionalSupporters ?? 0;
  const footer = scoreLine(t, r);
  const first = rank === 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('categoriesScreen.why.rankLabel', { rank })}. ${r.item.title}. ${blockTitle(t, r)}. ${stats.map((s) => `${s.value} ${s.label}`).join(', ')}`}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: r.item.id } })}
      style={({ pressed }) => ({ backgroundColor: c.surface, borderRadius: radius.xl - 6, borderWidth: 1, borderColor: c.hairline, overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      {first ? <CatalogImage image={r.item.primaryImage} category={r.item.category} title={r.item.title} style={{ width: '100%', aspectRatio: 1.9 }} /> : null}
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {!first ? <CatalogImage image={r.item.primaryImage} category={r.item.category} compact style={{ width: 64, height: 64, borderRadius: radius.md }} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              #{rank} · {blockTitle(t, r)}
            </Text>
            <Text style={{ color: c.text, fontFamily: fonts.displayHeavy, fontSize: first ? 26 : 20, lineHeight: first ? 29 : 23, letterSpacing: -0.5 }} numberOfLines={2}>
              {r.item.title}
            </Text>
          </View>
        </View>
        {stats.length ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {stats.map((s) => (
              <View key={s.label} style={{ flex: 1, backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 }}>
                <Text style={{ color: s.people ? c.affinity : c.text, fontFamily: fonts.displayHeavy, fontSize: first ? 26 : 20, letterSpacing: -0.6 }} numberOfLines={1}>
                  {s.value}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 11, lineHeight: 14 }} numberOfLines={2}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('categoriesScreen.why.noSignals')}</Text>
        )}
        {exceptional > 0 ? <ExceptionalBadge count={exceptional} /> : null}
        {footer ? <Text style={{ color: c.textSubtle, fontSize: 12 }}>{footer}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Resumen numérico de una fila (puesto 4 en adelante): las dos primeras cifras y la marca de excepcional. */
export function EvidenceInline({ r }: { r: RecommendationDto }) {
  const { t } = useTranslation();
  const c = usePalette();
  const stats = evidenceStats(t, r).slice(0, 2);
  const exceptional = r.reason.evidence?.exceptionalSupporters ?? 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <MaterialCommunityIcons name={REASON_ICON[r.reason.code]} size={14} color={isPeopleReason(r) ? c.affinity : c.textSubtle} style={{ marginTop: 2 }} />
      <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, flexShrink: 1 }}>
        {blockTitle(t, r)}
        {stats.map((s) => (
          <Text key={s.label}>
            {' · '}
            <Text style={{ color: s.people ? c.affinity : c.text, fontWeight: '700' }}>{s.value}</Text> {s.label}
          </Text>
        ))}
        {exceptional > 0 ? <Text style={{ color: c.affinity }}> · ✦ {exceptional}</Text> : null}
      </Text>
    </View>
  );
}
