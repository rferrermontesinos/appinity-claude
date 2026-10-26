import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { radius, spacing, usePalette } from '../theme';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/** Icono discreto por proveedor (§2: la fuente externa se representa con un icono y una etiqueta accesible). */
const ICONS: Record<string, Icon> = {
  steam: 'steam',
  spotify: 'spotify',
  apple_music: 'apple',
  apple_podcasts: 'podcast',
  youtube: 'youtube',
  google_maps: 'google-maps',
  osm: 'map-outline',
  imdb: 'movie-open-outline',
  tmdb: 'movie-open-outline',
  openlibrary: 'book-open-page-variant-outline',
  goodreads: 'book-outline',
  musicbrainz: 'music-circle-outline',
  discogs: 'album',
  anilist: 'book-open-outline',
  igdb: 'gamepad-variant-outline',
  website: 'web',
  wikipedia: 'wikipedia',
  wikidata: 'database-outline',
};

/** Solo donde se consume puede ser la acción principal; las referencias (Wikidata, Wikipedia…) van como chips. */
const PRIMARY = new Set([
  'steam',
  'spotify',
  'apple_music',
  'apple_podcasts',
  'youtube',
  'google_maps',
  'imdb',
  'openlibrary',
  'goodreads',
  'website',
]);

/** Abre enlaces externos solo si son https (validación de enlaces). */
export function openExternal(url: string) {
  if (url.startsWith('https://')) void WebBrowser.openBrowserAsync(url);
}

/**
 * «Dónde encontrarlo»: el primer enlace (el de consumo de la categoría: Spotify, Steam, Google Maps…) como acción
 * principal en chispa; el resto, como chips discretos con icono y nombre. El orden lo decide el servidor.
 */
export function SourceLinks({
  links,
  accent,
}: {
  links: Array<{ provider: string; url: string }>;
  accent?: string;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  if (!links.length) return null;
  const name = (p: string) => t(`item.providers.${p}`, { defaultValue: p });
  const first = links.find((l) => PRIMARY.has(l.provider));
  const rest = links.filter((l) => l !== first);
  return (
    <View style={{ gap: spacing.md }}>
      {first ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('item.openIn', { name: name(first!.provider) })}
          onPress={() => openExternal(first!.url)}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: radius.full,
            backgroundColor: c.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            boxShadow: `0px 10px 28px -10px ${c.accent}`,
          })}
        >
          <MaterialCommunityIcons
            name={ICONS[first!.provider] ?? 'open-in-new'}
            size={22}
            color={c.accentText}
          />
          <Text style={{ color: c.accentText, fontSize: 16, fontWeight: '700' }}>
            {t('item.openIn', { name: name(first!.provider) })}
          </Text>
        </Pressable>
      ) : null}
      {rest.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {rest.map((l) => (
            <Pressable
              key={l.provider}
              accessibilityRole="link"
              accessibilityLabel={t('item.openIn', { name: name(l.provider) })}
              onPress={() => openExternal(l.url)}
              style={({ pressed }) => ({
                minHeight: 40,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing.md,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: accent ?? c.border,
                backgroundColor: pressed ? c.surfaceRaised : 'transparent',
              })}
            >
              <MaterialCommunityIcons name={ICONS[l.provider] ?? 'open-in-new'} size={16} color={c.text} />
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{name(l.provider)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
