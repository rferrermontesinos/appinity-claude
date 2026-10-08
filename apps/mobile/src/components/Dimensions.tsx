import type { ItemProfileDto, PreferenceBasis } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { ConsolidationNotes } from '../api/queries';
import { radius, spacing, usePalette } from '../theme';

const fmt = (v: number) => v.toFixed(2);

export function formatPreference(score: number | null): string {
  if (score === null) return '—';
  return `${score > 0 ? '+' : score < 0 ? '−' : '±'}${Math.abs(score).toFixed(2)}`;
}

function Cell({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm, gap: 2 }}>
      <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: color ?? c.text, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      {detail ? <Text style={{ color: c.textMuted, fontSize: 10 }} numberOfLines={2}>{detail}</Text> : null}
    </View>
  );
}

/**
 * Las tres dimensiones independientes del modelo. La preferencia NULL se muestra como «—» con el texto
 * «Sin evidencia»; nunca se pinta como 0.
 */
export function Dimensions({
  knownConfidence,
  consumedConfidence,
  preferenceScore,
  preferenceConfidence,
  preferenceBasis,
}: Pick<ItemProfileDto, 'knownConfidence' | 'consumedConfidence' | 'preferenceScore' | 'preferenceConfidence' | 'preferenceBasis'>) {
  const { t } = useTranslation();
  const c = usePalette();
  const prefColor =
    preferenceScore === null ? c.textMuted : preferenceScore > 0.05 ? c.positive : preferenceScore < -0.05 ? c.negative : c.neutral;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Cell label={t('dimensions.known')} value={fmt(knownConfidence)} />
      <Cell label={t('dimensions.consumed')} value={fmt(consumedConfidence)} />
      <Cell
        label={t('dimensions.preference')}
        value={formatPreference(preferenceScore)}
        color={prefColor}
        detail={
          preferenceScore === null || preferenceConfidence === null || !preferenceBasis
            ? t('dimensions.noEvidence')
            : `${t(`basis.${preferenceBasis}`)} · ${t('dimensions.confidence', { value: fmt(preferenceConfidence) })}`
        }
      />
    </View>
  );
}

/** Etiquetas de escenario derivadas de los datos (ayudan a localizar los casos del modelo en la demo). */
export function scenarioKeys(p: ItemProfileDto & { notes?: ConsolidationNotes | null }): string[] {
  const keys: string[] = [];
  const basis = p.preferenceBasis as PreferenceBasis | null;
  if (p.item.category === 'games' && p.consumedConfidence === 0) keys.push('scenario.zeroHours');
  else if (p.knownConfidence < 1 && p.consumedConfidence === 0) keys.push('scenario.planned');
  else if (p.consumedConfidence === 0 && p.preferenceScore === null) keys.push('scenario.watchlist');
  if (p.consumedConfidence > 0 && p.preferenceScore === null) keys.push('scenario.consumedNoRating');
  if (p.sourceCount > 1) keys.push('scenario.multiSource');
  if (basis === 'explicit_rating' && p.notes?.overridden?.some((o) => o.basis === 'attendance')) {
    keys.push('scenario.ratingOverAttendance');
  }
  if (p.preferenceScore !== null && p.preferenceScore < 0) keys.push('scenario.negative');
  return keys;
}

export function Tag({ label }: { label: string }) {
  const c = usePalette();
  return (
    <View style={{ backgroundColor: `${c.accent}18`, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
