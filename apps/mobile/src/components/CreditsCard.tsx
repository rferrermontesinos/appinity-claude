import { useTranslation } from 'react-i18next';
import { Linking, Pressable } from 'react-native';
import { usePalette } from '../theme';
import { Card, Small, Title } from './ui';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

/** Créditos y atribuciones de las fuentes de datos (OpenStreetMap exige la atribución ODbL). */
export function CreditsCard() {
  const { t } = useTranslation();
  const c = usePalette();
  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('credits.title')}</Title>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(OSM_COPYRIGHT)}>
        <Small style={{ color: c.accent }}>{t('credits.osm')}</Small>
      </Pressable>
      <Small>{t('credits.wikidata')}</Small>
      <Small>{t('credits.steam')}</Small>
      <Small>{t('credits.google')}</Small>
    </Card>
  );
}
