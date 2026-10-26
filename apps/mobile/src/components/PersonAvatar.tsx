import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { fonts, usePalette } from '../theme';

/** Foto de perfil o, si no hay, la inicial del nombre (sin imágenes de terceros inventadas). */
export function PersonAvatar({ name, url, size = 44, ring }: { name: string; url: string | null; size?: number; ring?: boolean }) {
  const c = usePalette();
  if (url?.startsWith('https://')) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, ...(ring ? { borderWidth: 2, borderColor: c.accent } : {}) }} accessibilityLabel={name} />;
  }
  return (
    <View
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center', ...(ring ? { borderWidth: 2, borderColor: c.accent } : {}) }}
    >
      <Text style={{ color: c.onPrimaryContainer, fontFamily: fonts.display, fontSize: size * 0.4 }}>{name.trim().charAt(0).toUpperCase() || '·'}</Text>
    </View>
  );
}

/** Afinidad 0–100 redondeada; NULL se muestra como raya (nunca 0 %). */
export function formatAffinity(score: number | null): string | null {
  return score === null ? null : String(Math.round(score));
}
