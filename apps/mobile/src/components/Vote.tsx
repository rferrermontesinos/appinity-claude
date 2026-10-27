import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { VoteValueDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { DeckEntry } from '../state/homeDeck';
import { fonts, onImage, radius, spacing, usePalette, type Palette } from '../theme';
import { mixHex } from './Aura';

/**
 * Votación de Inicio («Aura», motor de votos 2026-10-27). Cuatro niveles en una escala con dos lados:
 * negativo (coral) y positivo (lima, el color de las almas gemelas). La intensidad nunca depende solo del color:
 * cada nivel tiene su icono, su texto y su posición en el medidor de 4 segmentos.
 * «No lo conozco» es neutro (no cuenta para tus gustos) y «Guardar» no es un voto.
 */
export type VoteLevel = -2 | -1 | 1 | 2;
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type VoteKey = 'hate' | 'dislike' | 'like' | 'love';

export const VOTE_LEVELS: ReadonlyArray<{ value: VoteLevel; key: VoteKey; icon: IconName }> = [
  { value: -2, key: 'hate', icon: 'heart-broken' },
  { value: -1, key: 'dislike', icon: 'thumb-down' },
  { value: 1, key: 'like', icon: 'thumb-up' },
  { value: 2, key: 'love', icon: 'heart' },
];

const levelOf = (v: VoteLevel) => VOTE_LEVELS.find((l) => l.value === v)!;
export const voteKey = (v: VoteValueDto): VoteKey | 'unknown' => (v === 'unknown' ? 'unknown' : levelOf(v).key);
export const voteIcon = (v: VoteValueDto): IconName => (v === 'unknown' ? 'help-circle-outline' : levelOf(v).icon);
export function voteColor(c: Palette, v: VoteValueDto): string {
  return v === 'unknown' ? c.neutral : v < 0 ? c.negative : c.affinity;
}

/** Medidor de 4 segmentos: dónde cae el voto en la escala (los dos centrales son los suaves). */
export function VoteMeter({ value, color, track }: { value: VoteValueDto | null; color: string; track: string }) {
  const lit = (i: number) =>
    value === -2 ? i <= 1 : value === -1 ? i === 1 : value === 1 ? i === 2 : value === 2 ? i >= 2 : false;
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: 16, height: 4, borderRadius: 2, backgroundColor: lit(i) ? color : track, marginLeft: i === 2 ? 4 : 0 }} />
      ))}
    </View>
  );
}

/** Sello que se ve ANTES de soltar la tarjeta: nivel, medidor y si cuenta o no para tus gustos. */
export function VoteStamp({ zone }: { zone: VoteValueDto | 'save' }) {
  const { t } = useTranslation();
  const c = usePalette();
  const color = zone === 'save' ? c.text : voteColor(c, zone);
  const label = zone === 'save' ? t('home.vote.saved') : t(`home.vote.${voteKey(zone)}`);
  const hint = zone === 'save' ? t('home.vote.saveHint') : zone === 'unknown' ? t('home.vote.unknownHint') : t('home.vote.counts');
  return (
    <View
      pointerEvents="none"
      style={{ alignItems: 'center', gap: spacing.sm, backgroundColor: onImage.glass, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: mixHex(color, '#0C0C0E', 0.45) }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <MaterialCommunityIcons name={zone === 'save' ? 'bookmark' : voteIcon(zone)} size={26} color={color} />
        <Text style={{ color: onImage.text, fontFamily: fonts.displayHeavy, fontSize: 24, letterSpacing: -0.5 }}>{label}</Text>
      </View>
      {zone === 'save' || zone === 'unknown' ? null : <VoteMeter value={zone} color={color} track="rgba(245,243,240,0.22)" />}
      <Text style={{ color: onImage.muted, fontSize: 12 }}>{hint}</Text>
    </View>
  );
}

/** Botón de un nivel: los extremos son más grandes (más intensidad, más peso visual); «Me encanta» brilla. */
function LevelButton({ level, onPress, disabled }: { level: (typeof VOTE_LEVELS)[number]; onPress: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  const strong = Math.abs(level.value) === 2;
  const size = strong ? 58 : 50;
  const side = voteColor(c, level.value);
  const bg = level.value === 2 ? c.affinity : level.value === -2 ? mixHex(c.negative, c.surfaceRaised, 0.72) : c.surfaceRaised;
  const fg = level.value === 2 ? c.onAffinity : side;
  const label = t(`home.vote.${level.key}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('home.vote.counts')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 76, alignItems: 'center', gap: 6, opacity: disabled ? 0.35 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: strong ? 0 : 1,
          borderColor: c.border,
          boxShadow: level.value === 2 ? `0px 10px 28px -8px ${c.affinity}99` : undefined,
        }}
      >
        <MaterialCommunityIcons name={level.icon} size={strong ? 28 : 24} color={fg} />
      </View>
      <Text importantForAccessibility="no" accessibilityElementsHidden numberOfLines={1} style={{ color: c.textMuted, fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function PillButton({ icon, label, hint, onPress, disabled }: { icon: IconName; label: string; hint: string; onPress: () => void; disabled: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 48,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.surfaceRaised : 'transparent',
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={20} color={c.textMuted} />
      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Alternativa a los gestos (siempre visible): los 4 niveles y, debajo, «No lo conozco» y «Guardar». */
export function VoteBar({ onVote, onSave, disabled }: { onVote: (value: VoteValueDto) => void; onSave: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.md, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.sm }}>
        {VOTE_LEVELS.map((level) => (
          <LevelButton key={level.key} level={level} onPress={() => onVote(level.value)} disabled={disabled} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
        <PillButton icon="help-circle-outline" label={t('home.vote.unknown')} hint={t('home.vote.unknownHint')} onPress={() => onVote('unknown')} disabled={disabled} />
        <PillButton icon="bookmark-outline" label={t('home.vote.save')} hint={t('home.vote.saveHint')} onPress={onSave} disabled={disabled} />
      </View>
    </View>
  );
}

/**
 * Última acción con su «Deshacer» (sustituye al botón fijo). Confirma qué nivel quedó registrado —el gesto es
 * graduado y es fácil pasarse— y no caduca: sigue ahí hasta la siguiente acción (sin límite de tiempo, WCAG 2.2.1).
 */
export function LastActionBar({ entry, onUndo, disabled }: { entry: DeckEntry | null; onUndo: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  if (!entry) return null;
  const { action } = entry;
  const color = action.kind === 'save' ? c.text : voteColor(c, action.value);
  const label = action.kind === 'save' ? t('home.vote.saved') : t(`home.vote.${voteKey(action.value)}`);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: c.surfaceRaised, borderRadius: radius.full, paddingLeft: spacing.lg, paddingRight: spacing.xs, alignSelf: 'center', maxWidth: '100%' }}>
      <MaterialCommunityIcons name={action.kind === 'save' ? 'bookmark' : voteIcon(action.value)} size={18} color={color} />
      <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ color: c.text, fontSize: 14, flexShrink: 1 }}>
        {t('home.vote.last', { title: entry.item.item.title, label })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.undoItem', { title: entry.item.item.title })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onUndo}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingHorizontal: spacing.md, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}
      >
        <MaterialCommunityIcons name="undo" size={18} color={c.primaryInk} />
        <Text style={{ color: c.primaryInk, fontSize: 14, fontWeight: '700' }}>{t('home.undo')}</Text>
      </Pressable>
    </View>
  );
}
