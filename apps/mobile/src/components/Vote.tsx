import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { VoteValueDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { DeckAction, DeckEntry } from '../state/homeDeck';
import { fonts, onImage, radius, spacing, usePalette, type Palette } from '../theme';
import { mixHex } from './Aura';

/**
 * Votación («Aura», modelo binario + «Me encanta», decisión del titular 2026-10-27; ver docs/decisions.md):
 * - Votos (cuentan para tus gustos y tus almas gemelas): «No me gusta» (coral), «Me gusta» y «Me encanta» (lima, el color
 *   de las almas gemelas). Cada uno con su icono y su texto: nunca solo el color.
 * - Sin efecto en gustos: «Guardar» (a Recomendaciones) y «Paso» (vuelve a Inicio al mes).
 */
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type VoteKey = 'dislike' | 'like' | 'love';

export const VOTE_LEVELS: ReadonlyArray<{ value: VoteValueDto; key: VoteKey; icon: IconName }> = [
  { value: -1, key: 'dislike', icon: 'thumb-down' },
  { value: 1, key: 'like', icon: 'thumb-up' },
  { value: 2, key: 'love', icon: 'heart' },
];

/** Etiqueta, icono y color de cualquier acción del mazo (votos antiguos −2 se muestran como «No me gusta»). */
export function actionLook(c: Palette, a: DeckAction['kind'] | 'vote', value?: number): { key: string; icon: IconName; color: string } {
  if (a === 'save') return { key: 'saved', icon: 'bookmark', color: c.text };
  if (a === 'pass') return { key: 'passed', icon: 'skip-next', color: c.neutral };
  const level = VOTE_LEVELS.find((l) => l.value === value) ?? VOTE_LEVELS[0]!;
  return { key: level.key, icon: level.icon, color: level.value < 0 ? c.negative : c.affinity };
}

export type CardZone = DeckAction;

/** Sello que se ve ANTES de soltar la tarjeta: qué harás y si cuenta o no para tus gustos. */
export function VoteStamp({ zone }: { zone: CardZone }) {
  const { t } = useTranslation();
  const c = usePalette();
  const look = actionLook(c, zone.kind, zone.kind === 'vote' ? zone.value : undefined);
  const hint = zone.kind === 'save' ? t('home.vote.saveHint') : zone.kind === 'pass' ? t('home.vote.passHint') : t('home.vote.counts');
  return (
    <View
      pointerEvents="none"
      style={{ alignItems: 'center', gap: spacing.xs, backgroundColor: onImage.glass, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: mixHex(look.color, '#0C0C0E', 0.45) }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <MaterialCommunityIcons name={look.icon} size={zone.kind === 'vote' && zone.value === 2 ? 32 : 26} color={look.color} />
        <Text style={{ color: onImage.text, fontFamily: fonts.displayHeavy, fontSize: 24, letterSpacing: -0.5 }}>{t(`home.vote.${look.key}`)}</Text>
      </View>
      <Text style={{ color: onImage.muted, fontSize: 12 }}>{hint}</Text>
    </View>
  );
}

/** Botón redondo con etiqueta debajo. `emphasis`: «Me encanta», relleno en lima y con brillo. */
export function RoundAction({
  icon,
  label,
  hint,
  color,
  size,
  emphasis,
  selected,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  hint: string;
  color: string;
  size: number;
  emphasis?: boolean;
  selected?: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const c = usePalette();
  const filled = emphasis || selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected: Boolean(selected) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 66, alignItems: 'center', gap: 6, opacity: disabled && !selected ? 0.35 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? (color === c.affinity ? c.affinity : mixHex(color, c.surfaceRaised, 0.55)) : c.surfaceRaised,
          borderWidth: filled ? 0 : 1,
          borderColor: c.border,
          boxShadow: emphasis ? `0px 10px 28px -8px ${c.affinity}99` : undefined,
        }}
      >
        <MaterialCommunityIcons name={icon} size={Math.round(size * 0.46)} color={filled && color === c.affinity ? c.onAffinity : color} />
      </View>
      <Text importantForAccessibility="no" accessibilityElementsHidden numberOfLines={1} style={{ color: selected ? c.text : c.textMuted, fontSize: 11, fontWeight: selected ? '700' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Alternativa a los gestos (siempre visible), en el orden de la pantalla: No me gusta · Paso · Guardar · Me gusta ·
 * Me encanta. Los votos son más grandes que las dos acciones sin efecto en gustos.
 */
export function VoteBar({ onAction, disabled }: { onAction: (zone: CardZone) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
      <RoundAction icon="thumb-down" label={t('home.vote.dislike')} hint={t('home.vote.counts')} color={c.negative} size={54} onPress={() => onAction({ kind: 'vote', value: -1 })} disabled={disabled} />
      <RoundAction icon="skip-next" label={t('home.vote.pass')} hint={t('home.vote.passHint')} color={c.textMuted} size={44} onPress={() => onAction({ kind: 'pass' })} disabled={disabled} />
      <RoundAction icon="bookmark-outline" label={t('home.vote.save')} hint={t('home.vote.saveHint')} color={c.text} size={44} onPress={() => onAction({ kind: 'save' })} disabled={disabled} />
      <RoundAction icon="thumb-up" label={t('home.vote.like')} hint={t('home.vote.counts')} color={c.affinity} size={54} onPress={() => onAction({ kind: 'vote', value: 1 })} disabled={disabled} />
      <RoundAction icon="heart" label={t('home.vote.love')} hint={t('home.vote.counts')} color={c.affinity} size={60} emphasis onPress={() => onAction({ kind: 'vote', value: 2 })} disabled={disabled} />
    </View>
  );
}

/**
 * Última acción con su «Deshacer» (sustituye al botón fijo). Confirma qué quedó registrado y no caduca: sigue ahí
 * hasta la siguiente acción (sin límite de tiempo, WCAG 2.2.1).
 */
export function LastActionBar({ entry, onUndo, disabled }: { entry: DeckEntry | null; onUndo: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  if (!entry) return null;
  const { action } = entry;
  const look = actionLook(c, action.kind, action.kind === 'vote' ? action.value : undefined);
  const label = t(`home.vote.${look.key}`);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: c.surfaceRaised, borderRadius: radius.full, paddingLeft: spacing.lg, paddingRight: spacing.xs, alignSelf: 'center', maxWidth: '100%' }}>
      <MaterialCommunityIcons name={look.icon} size={18} color={look.color} />
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
