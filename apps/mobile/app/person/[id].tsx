import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { usePerson } from '../../src/api/queries';
import { ChatActions } from '../../src/components/ChatActions';
import { PersonActions } from '../../src/components/PersonActions';
import { AffinityFigure, CategoryAffinityBar } from '../../src/components/Affinity';
import { PersonAvatar } from '../../src/components/PersonAvatar';
import { Badge, Body, Card, ErrorCard, Loading, Screen, Small, Title } from '../../src/components/ui';
import { fonts, spacing, usePalette } from '../../src/theme';

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
  return (
    <Screen refreshing={person.isRefetching} onRefresh={() => void person.refetch()}>
      <Stack.Screen options={{ title: data?.displayName ?? t('people.title') }} />
      {person.isLoading ? <Loading /> : null}
      {person.error ? <ErrorCard error={person.error} onRetry={() => void person.refetch()} /> : null}
      {data ? (
        <>
          {/* Cabecera del concepto: persona a la izquierda y cifra de afinidad grande a la derecha. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <PersonAvatar name={data.displayName} url={data.avatarUrl} size={72} ring />
              <Text style={{ color: c.text, fontFamily: fonts.display, fontSize: 22, marginTop: spacing.sm }} numberOfLines={2}>
                {data.displayName}
              </Text>
              {data.countryCode ? <Small>{data.countryCode}</Small> : null}
            </View>
            <AffinityFigure score={data.affinity.score} caption={t('people.affinity')} />
          </View>
          {data.affinity.exceptionalMutual ? <Badge label={t('people.exceptionalMutual')} color={c.ok} /> : null}
          <Small>{t('people.affinityHint')}</Small>
          <ChatActions person={data} />
          <Card>
            <Title>{t('people.byCategory')}</Title>
            {data.affinity.categories.map((cat) => (
              <CategoryAffinityBar key={cat.category} category={cat.category} score={cat.score} />
            ))}
            {data.affinity.algorithmVersion ? <Small>{t('people.algorithm', { version: data.affinity.algorithmVersion })}</Small> : null}
          </Card>
          <PersonActions person={data} />
          <Body muted>{t('people.privacyNote')}</Body>
        </>
      ) : null}
    </Screen>
  );
}
