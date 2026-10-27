import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { VoteValueDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { DeckAction, DeckEntry } from '../state/homeDeck';
import { fonts, onImage, radius, spacing, usePalette, type Palette } from '../theme';
import { mixHex } from './Aura';

/**
 * Votación («Aura», motor v3, decisión del titular 2026-10-27; ver docs/decisions.md). Cuatro opciones en una escala:
 * «No me gusta» (coral) · «No lo conozco» (neutro, no cuenta) · «Me gusta» (lima, el color de las almas gemelas) ·
 * «Me encanta» (rosa «Flechazo», relleno y con brillo: el voto más fuerte). Cada una con su icono y su texto: nunca solo
 * el color.
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
  return { key: level.key, icon: level.icon, color: level.value < 0 ? c.negative : level.value === 2 ? c.love : c.affinity };
}

/** Colores del sello sobre la imagen (el velo es siempre oscuro): legibles en tema claro y oscuro. */
const STAMP_COLOR: Record<string, string> = { dislike: onImage.dislike, unknown: onImage.unknown, like: onImage.like, love: onImage.love };

/**
 * Sello que se ve mientras deslizas: aparece en cuanto se mueve el dedo y se completa al llegar al umbral (`armed`: al
 * soltar, cuenta). «Me encanta», relleno en su rosa y con brillo: el voto más fuerte se distingue de un vistazo.
 */
export function VoteStamp({ zone, armed }: { zone: DeckAction; armed: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  const look = actionLook(c, zone);
  const color = STAMP_COLOR[look.key] ?? onImage.text;
  const love = look.key === 'love';
  return (
    <View
      pointerEvents="none"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: love ? color : onImage.glass,
        borderRadius: radius.full,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderWidth: 2,
        borderColor: armed ? (love ? onImage.text : color) : 'transparent',
        boxShadow: love && armed ? `0px 0px 36px ${color}` : undefined,
      }}
    >
      <MaterialCommunityIcons name={look.icon} size={love ? 30 : 26} color={love ? onImage.onLove : color} />
      <Text style={{ color: love ? onImage.onLove : onImage.text, fontFamily: fonts.displayHeavy, fontSize: love ? 26 : 24, letterSpacing: -0.5 }}>{t(`home.vote.${look.key}`)}</Text>
    </View>
  );
}

/**
 * Botón redondo con etiqueta debajo. `emphasis`: «Me encanta», relleno y con brillo; `selected`: tu voto. `onColor`:
 * icono sobre el relleno de `color` (sin él, el relleno es una mezcla suave del color).
 */
export function RoundAction({
  icon,
  label,
  hint,
  color,
  size,
  emphasis,
  selected,
  onColor,
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
  onColor?: string;
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
      style={({ pressed }) => ({ width: 80, alignItems: 'center', gap: 6, opacity: disabled && !selected ? 0.35 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? (onColor ? color : mixHex(color, c.surfaceRaised, 0.55)) : c.surfaceRaised,
          borderWidth: filled ? 0 : 1,
          borderColor: c.border,
          boxShadow: emphasis ? `0px 10px 28px -8px ${color}99` : undefined,
        }}
      >
        <MaterialCommunityIcons name={icon} size={Math.round(size * 0.46)} color={filled && onColor ? onColor : color} />
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
      <RoundAction icon="heart" label={t('home.vote.love')} hint={t('home.vote.counts')} color={c.love} onColor={c.onLove} size={62} emphasis onPress={() => onAction({ kind: 'vote', value: 2 })} disabled={disabled} />
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
