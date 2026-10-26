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

/**
 * Cifras que justifican el puesto (decisión del titular): cuántas almas gemelas lo recomiendan y su afinidad media
 * contigo. En los otros motivos, su equivalente (votos de la zona, personas de la comunidad, gustos tuyos). Agregados
 * reales del servidor; ninguna inventada.
 */
export function evidenceStats(t: TFunction, r: RecommendationDto): Stat[] {
  const e = r.reason.evidence;
  const out: Stat[] = [];
  switch (r.reason.code) {
    case 'consensus':
      if (r.reason.supporters !== undefined && r.reason.opinionated) out.push({ value: `${r.reason.supporters}/${r.reason.opinionated}`, label: t('categoriesScreen.why.supporters'), people: true });
      if (e?.supporterAffinity !== undefined) out.push({ value: `${e.supporterAffinity} %`, label: t('categoriesScreen.why.affinityMean'), people: true });
      break;
    case 'discovery':
      if (e?.supporterAffinity !== undefined) out.push({ value: `${e.supporterAffinity} %`, label: t('categoriesScreen.why.affinityOne'), people: true });
      break;
    case 'trending':
      if (r.reason.positiveVoters !== undefined && r.reason.totalVoters) out.push({ value: `${r.reason.positiveVoters}/${r.reason.totalVoters}`, label: t('categoriesScreen.why.areaVoters') });
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

/**
 * Fila del ranking de una categoría: puesto, portada, título, motivo y sus cifras, y la insignia si lo recomienda un
 * alma gemela excepcional. Los 3 primeros (`featured`) van solo un poco más destacados: puesto en lima, portada algo
 * mayor y superficie elevada.
 */
export function RankedRow({ r, rank, featured }: { r: RecommendationDto; rank: number; featured: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const stats = evidenceStats(t, r);
  const exceptional = r.reason.evidence?.exceptionalSupporters ?? 0;
  const size = featured ? 72 : 60;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        t('categoriesScreen.why.rankLabel', { rank }),
        r.item.title,
        blockTitle(t, r),
        ...stats.map((s) => `${s.value} ${s.label}`),
        ...(exceptional ? [t('categoriesScreen.why.exceptional', { count: exceptional })] : []),
      ].join('. ')}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: r.item.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        padding: spacing.sm + 2,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        backgroundColor: featured ? c.surfaceRaised : c.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.hairline,
      })}
    >
      <Text style={{ width: 24, textAlign: 'center', color: featured ? c.affinity : c.textSubtle, fontFamily: featured ? fonts.displayHeavy : fonts.display, fontSize: featured ? 20 : 15 }}>
        {rank}
      </Text>
      <CatalogImage image={r.item.primaryImage} category={r.item.category} compact style={{ width: size, height: size, borderRadius: radius.md }} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.text, fontFamily: fonts.display, fontSize: featured ? 17 : 16, lineHeight: featured ? 20 : 19 }} numberOfLines={2}>
          {r.item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <MaterialCommunityIcons name={REASON_ICON[r.reason.code]} size={14} color={isPeopleReason(r) ? c.affinity : c.textSubtle} style={{ marginTop: 2 }} />
          <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, flexShrink: 1 }}>{blockTitle(t, r)}</Text>
        </View>
        {stats.map((s) => (
          <Text key={s.label} style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>
            <Text style={{ color: s.people ? c.affinity : c.text, fontWeight: '700' }}>{s.value}</Text> {s.label}
          </Text>
        ))}
        {exceptional > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialCommunityIcons name="star-four-points" size={13} color={c.affinity} />
            <Text style={{ color: c.affinity, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>{t('categoriesScreen.why.exceptional', { count: exceptional })}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
