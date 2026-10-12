import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { usePerson } from '../../src/api/queries';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Badge, Body, Card, CategoryIcon, ErrorCard, Loading, Screen, Small, Title } from '../../src/components/ui';
import { spacing, usePalette } from '../../src/theme';

/**
 * Perfil público mínimo (§4): nombre, país, foto, afinidad global y las ocho afinidades por categoría. NULL se muestra
 * como raya. Nunca muestra el historial de la persona.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const person = usePerson(id ?? '');
  const data = person.data;
  const global = data ? formatAffinity(data.affinity.score) : null;
  return (
    <Screen refreshing={person.isRefetching} onRefresh={() => void person.refetch()}>
      <Stack.Screen options={{ title: data?.displayName ?? t('people.title') }} />
      {person.isLoading ? <Loading /> : null}
      {person.error ? <ErrorCard error={person.error} onRetry={() => void person.refetch()} /> : null}
      {data ? (
        <>
          <Card style={{ alignItems: 'center' }}>
            <PersonAvatar name={data.displayName} url={data.avatarUrl} size={72} />
            <Title>{data.displayName}</Title>
            {data.countryCode ? <Small>{data.countryCode}</Small> : null}
            <Text style={{ color: c.accent, fontSize: 36, fontWeight: '800' }} accessibilityLabel={`${t('people.affinity')} ${global ?? '—'}`}>
              {global === null ? '—' : t('people.affinityValue', { value: global })}
            </Text>
            <Small>{t('people.affinity')}</Small>
            {data.affinity.exceptionalMutual ? <Badge label={t('people.exceptionalMutual')} color={c.ok} /> : null}
            {/* alignSelf stretch: en la tarjeta centrada, el texto debe ajustarse al ancho en vez de ensancharla. */}
            <Small style={{ textAlign: 'center', alignSelf: 'stretch' }}>{t('people.affinityHint')}</Small>
          </Card>
          <Card>
            <Title>{t('people.byCategory')}</Title>
            {data.affinity.categories.map((cat) => {
              const value = formatAffinity(cat.score);
              return (
                <View key={cat.category} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <CategoryIcon category={cat.category} size={16} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '600' }}>{t(`categories.${cat.category}`)}</Text>
                    <Small>{value === null ? t('people.noData') : t('people.commonItems', { count: cat.commonItems })}</Small>
                  </View>
                  <Text style={{ color: value === null ? c.textMuted : c.text, fontWeight: '800', fontSize: 16 }}>
                    {value === null ? '—' : t('people.affinityValue', { value })}
                  </Text>
                </View>
              );
            })}
            {data.affinity.algorithmVersion ? <Small>{t('people.algorithm', { version: data.affinity.algorithmVersion })}</Small> : null}
          </Card>
          <Body muted>{t('people.privacyNote')}</Body>
        </>
      ) : null}
    </Screen>
  );
}
