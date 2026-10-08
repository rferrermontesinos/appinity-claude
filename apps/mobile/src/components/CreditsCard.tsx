import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { spacing } from '../theme';
import { Body, Card, Small, Title } from './ui';

/** Logo aprobado de TMDB (https://www.themoviedb.org/about/logos-attribution). Debe ser menos prominente que el de APPINITY. */
const TMDB_LOGO =
  'https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg';
const TMDB_URL = 'https://www.themoviedb.org/';
/** Aviso literal que exigen las condiciones de TMDB; se muestra en inglés tal cual. */
const TMDB_NOTICE = 'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';

/** Créditos y atribuciones de las fuentes de datos (TMDB exige logo y aviso en una sección «Acerca de»). */
export function CreditsCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('credits.title')}</Title>
      <View style={{ gap: spacing.xs }}>
        <Pressable accessibilityRole="link" accessibilityLabel="TMDB" onPress={() => void Linking.openURL(TMDB_URL)}>
          <Image source={{ uri: TMDB_LOGO }} style={{ width: 110, height: 14 }} contentFit="contain" accessibilityLabel="TMDB" />
        </Pressable>
        <Body>{t('credits.tmdb')}</Body>
        <Small>
          {t('credits.tmdbNoticeLabel')} {TMDB_NOTICE}
        </Small>
      </View>
      <Small>{t('credits.steam')}</Small>
      <Small>{t('credits.wikimedia')}</Small>
    </Card>
  );
}
