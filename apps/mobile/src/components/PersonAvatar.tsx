import { CATEGORIES, CATEGORY_META } from '@appinity/shared';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { fonts, usePalette } from '../theme';
import { mixHex } from './Aura';

/** Color estable por nombre (uno de los 8 de categoría, oscurecido): solo decorativo, no indica nada del gusto. */
function nameColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cat = CATEGORIES[h % CATEGORIES.length]!;
  return mixHex(CATEGORY_META[cat].color, '#000000', 0.45);
}

/**
 * Foto de perfil o, si no hay, la inicial sobre un color estable (sin imágenes de terceros inventadas). `ring` añade
 * el aro de «Aura» (lima para almas gemelas) separado por el color de fondo.
 */
export function PersonAvatar({ name, url, size = 44, ring }: { name: string; url: string | null; size?: number; ring?: boolean | string }) {
  const c = usePalette();
  const ringColor = typeof ring === 'string' ? ring : ring ? c.affinity : null;
  const inner = url?.startsWith('https://') ? (
    <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={name} />
  ) : (
    <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: nameColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: size * 0.4 }}>{name.trim().charAt(0).toUpperCase() || '·'}</Text>
    </View>
  );
  if (!ringColor) return inner;
  return <View style={{ padding: 2, borderRadius: size, borderWidth: 2, borderColor: ringColor }}>{inner}</View>;
}

/** Afinidad 0–100 redondeada; NULL se muestra como raya (nunca 0 %). */
export function formatAffinity(score: number | null): string | null {
  return score === null ? null : String(Math.round(score));
}
