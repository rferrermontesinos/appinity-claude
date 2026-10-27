import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META } from '@appinity/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { usePerson } from '../../src/api/queries';
import { CategoryAffinityBar } from '../../src/components/Affinity';
import { AuraCard, onPoster } from '../../src/components/Aura';
import { ChatActions } from '../../src/components/ChatActions';
import { DetailHeader } from '../../src/components/DetailHeader';
import { PersonActions } from '../../src/components/PersonActions';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Body, Card, ErrorCard, Screen, Skeleton, Small } from '../../src/components/ui';
import { radius, spacing, type, usePalette } from '../../src/theme';

/**
 * Perfil público mínimo (§4, «Aura»): cartel con la persona y tu afinidad hacia ella (direccional), teñido con su
 * categoría más afín; después, las ocho afinidades por categoría en orden canónico. NULL se muestra como raya. Nunca
 * muestra el historial de la persona: de lo que compartís, solo el recuento.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const person = usePerson(id ?? '');
  const data = person.data;
  const best = data?.affinity.categories.filter((x) => x.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const value = data ? formatAffinity(data.affinity.score) : null;
  return (
    <Screen refreshing={person.isRefetching} onRefresh={() => void person.refetch()}>
      {/* Cabecera única de detalle: el nombre ya está en el cartel. */}
      <Stack.Screen options={{ headerShown: false, title: data?.displayName ?? t('people.title') }} />
      <DetailHeader fallback="/people" />
      {person.isLoading ? <Skeleton rows={3} height={120} /> : null}
      {person.error ? <ErrorCard error={person.error} onRetry={() => void person.refetch()} /> : null}
      {data ? (
        <>
          <AuraCard accent={best ? CATEGORY_META[best.category].color : c.accent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <PersonAvatar name={data.displayName} url={data.avatarUrl} size={64} ring={onPoster.lime} />
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={{ color: onPoster.text, ...type.h2 }} numberOfLines={2}>
                  {data.displayName}
                </Text>
                {data.countryCode ? <Text style={{ color: onPoster.muted, fontSize: 14 }}>{data.countryCode}</Text> : null}
              </View>
            </View>
            <Text style={{ color: onPoster.lime, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: spacing.lg }}>
              {t('people.personKicker', { name: data.displayName })}
            </Text>
            <Text
              accessibilityLabel={`${t('people.affinity')} ${value === null ? '—' : t('people.affinityValue', { value })}`}
              style={{ color: value === null ? onPoster.muted : onPoster.text, ...type.figure }}
            >
              {value ?? '—'}
              {value !== null ? <Text style={{ fontSize: 26, letterSpacing: 0 }}> %</Text> : null}
            </Text>
            {data.affinity.exceptionalMutual ? (
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: onPoster.lime, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 }}>
                <MaterialCommunityIcons name="star-four-points" size={14} color={onPoster.onLime} />
                <Text style={{ color: onPoster.onLime, fontSize: 12, fontWeight: '700' }}>{t('people.exceptionalMutual')}</Text>
              </View>
            ) : null}
            <Text style={{ color: onPoster.muted, fontSize: 12, lineHeight: 17, marginTop: spacing.xs }}>{t('people.affinityHint')}</Text>
          </AuraCard>
          <ChatActions person={data} />
          <Card>
            <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
              {t('people.byCategory')}
            </Text>
            {data.affinity.categories.map((cat) => (
              <CategoryAffinityBar key={cat.category} item={cat} />
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
