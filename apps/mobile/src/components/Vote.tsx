import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { VoteValueDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { DeckAction, DeckEntry } from '../state/homeDeck';
import { fonts, onImage, radius, spacing, usePalette, type Palette } from '../theme';
import { mixHex } from './Aura';

/**
 * Votación («Aura», motor v3, decisión del titular 2026-10-27; ver docs/decisions.md). Cuatro opciones en una escala:
 * «No me gusta» (coral) · «No lo conozco» (neutro, no cuenta) · «Me gusta» y «Me encanta» (lima, el color de las almas
 * gemelas). Cada una con su icono y su texto: nunca solo el color.
 */
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type VoteKey = 'dislike' | 'like' | 'love';

export const VOTE_LEVELS: ReadonlyArray<{ value: VoteValueDto; key: VoteKey; icon: IconName }> = [
  { value: -1, key: 'dislike', icon: 'thumb-down' },
  { value: 1, key: 'like', icon: 'thumb-up' },
  { value: 2, key: 'love', icon: 'heart' },
];

/** Etiqueta, icono y color de una acción (votos antiguos −2 se muestran como «No me gusta»). */
export function actionLook(c: Palette, action: DeckAction): { key: string; icon: IconName; color: string } {
  if (action.kind === 'unknown') return { key: 'unknown', icon: 'help-circle-outline', color: c.neutral };
  const level = VOTE_LEVELS.find((l) => l.value === action.value) ?? VOTE_LEVELS[0]!;
  return { key: level.key, icon: level.icon, color: level.value < 0 ? c.negative : c.affinity };
}

/** Sello que se ve ANTES de soltar la tarjeta: qué harás y si cuenta o no para tus gustos. */
export function VoteStamp({ zone }: { zone: DeckAction }) {
  const { t } = useTranslation();
  const c = usePalette();
  const look = actionLook(c, zone);
  return (
    <View
      pointerEvents="none"
      style={{ alignItems: 'center', gap: spacing.xs, backgroundColor: onImage.glass, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: mixHex(look.color, '#0C0C0E', 0.45) }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <MaterialCommunityIcons name={look.icon} size={zone.kind === 'vote' && zone.value === 2 ? 32 : 26} color={look.color} />
        <Text style={{ color: onImage.text, fontFamily: fonts.displayHeavy, fontSize: 24, letterSpacing: -0.5 }}>{t(`home.vote.${look.key}`)}</Text>
      </View>
      <Text style={{ color: onImage.muted, fontSize: 12 }}>{zone.kind === 'unknown' ? t('home.vote.unknownHint') : t('home.vote.counts')}</Text>
    </View>
  );
}

/** Botón redondo con etiqueta debajo. `emphasis`: «Me encanta», relleno en lima y con brillo; `selected`: tu voto. */
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
  const lime = color === c.affinity;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected: Boolean(selected) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 80, alignItems: 'center', gap: 6, opacity: disabled && !selected ? 0.35 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? (lime ? c.affinity : mixHex(color, c.surfaceRaised, 0.55)) : c.surfaceRaised,
          borderWidth: filled ? 0 : 1,
          borderColor: c.border,
          boxShadow: emphasis ? `0px 10px 28px -8px ${c.affinity}99` : undefined,
        }}
      >
        <MaterialCommunityIcons name={icon} size={Math.round(size * 0.46)} color={filled && lime ? c.onAffinity : color} />
      </View>
      <Text importantForAccessibility="no" accessibilityElementsHidden numberOfLines={1} style={{ color: selected ? c.text : c.textMuted, fontSize: 12, fontWeight: selected ? '700' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Alternativa a los gestos (siempre visible), ordenada como una escala: No me gusta · No lo conozco · Me gusta ·
 * Me encanta. «No lo conozco», más pequeño: no es un voto.
 */
export function VoteBar({ onAction, disabled }: { onAction: (action: DeckAction) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
      <RoundAction icon="thumb-down" label={t('home.vote.dislike')} hint={t('home.vote.counts')} color={c.negative} size={56} onPress={() => onAction({ kind: 'vote', value: -1 })} disabled={disabled} />
      <RoundAction icon="help-circle-outline" label={t('home.vote.unknown')} hint={t('home.vote.unknownHint')} color={c.textMuted} size={46} onPress={() => onAction({ kind: 'unknown' })} disabled={disabled} />
      <RoundAction icon="thumb-up" label={t('home.vote.like')} hint={t('home.vote.counts')} color={c.affinity} size={56} onPress={() => onAction({ kind: 'vote', value: 1 })} disabled={disabled} />
      <RoundAction icon="heart" label={t('home.vote.love')} hint={t('home.vote.counts')} color={c.affinity} size={62} emphasis onPress={() => onAction({ kind: 'vote', value: 2 })} disabled={disabled} />
    </View>
  );
}

/**
 * Última acción con su «Deshacer». Confirma qué quedó registrado y no caduca: sigue ahí hasta la siguiente acción
 * (sin límite de tiempo, WCAG 2.2.1).
 */
export function LastActionBar({ entry, onUndo, disabled }: { entry: DeckEntry | null; onUndo: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  if (!entry) return null;
  const look = actionLook(c, entry.action);
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
