import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { usePalette } from '../theme';

/** Foto de perfil o, si no hay, la inicial del nombre (sin imágenes de terceros inventadas). */
export function PersonAvatar({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  const c = usePalette();
  if (url?.startsWith('https://')) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={name} />;
  }
  return (
    <View
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${c.accent}22`, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: c.accent, fontWeight: '800', fontSize: size * 0.42 }}>{name.trim().charAt(0).toUpperCase() || '·'}</Text>
    </View>
  );
}

/** Afinidad 0–100 redondeada; NULL se muestra como raya (nunca 0 %). */
export function formatAffinity(score: number | null): string | null {
  return score === null ? null : String(Math.round(score));
}
