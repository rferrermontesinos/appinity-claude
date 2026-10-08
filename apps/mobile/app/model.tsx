import { CATEGORIES, CATEGORY_META, type Category } from '@appinity/shared';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useItemProfiles, type ProfileView } from '../src/api/queries';
import { CatalogImage } from '../src/components/CatalogImage';
import { Dimensions, Tag, scenarioKeys } from '../src/components/Dimensions';
import { Badge, Body, Card, ErrorCard, Loading, Small, Title } from '../src/components/ui';
import { DataBanner } from '../src/components/DataBanner';
import { radius, spacing, usePalette } from '../src/theme';

function FilterChip({ label, selected, color, onPress }: { label: string; selected: boolean; color: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? color : c.border,
        backgroundColor: selected ? `${color}22` : c.surface,
      }}
    >
      <Text style={{ color: selected ? color : c.text, fontWeight: selected ? '700' : '500', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function ProfileRow({ profile, onPress }: { profile: ProfileView; onPress: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const scenarios = scenarioKeys(profile);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={profile.item.title}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <CatalogImage
            image={profile.item.primaryImage}
            category={profile.item.category}
            compact
            style={{ width: 56, height: 80, borderRadius: radius.sm }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
              {profile.item.title}
            </Text>
            <Small style={{ color: CATEGORY_META[profile.item.category].color, fontWeight: '700' }}>
              {t(`categories.${profile.item.category}`)}
            </Small>
            <Small>
              {t('model.sourcesCount', { count: profile.sourceCount })} · {t('model.evidenceCount', { count: profile.evidenceCount })}
            </Small>
            {profile.hasConflict ? <Badge label={t('model.conflict')} color={c.warn} /> : null}
          </View>
        </View>
        <Dimensions {...profile} />
        {scenarios.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {scenarios.map((key) => (
              <Tag key={key} label={t(key)} />
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

/**
 * Demo del modelo de datos: perfil consolidado del usuario simulado con Known, Consumed y Preference
 * separados. No es un recomendador ni muestra afinidades.
 */
export default function ModelScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const profiles = useItemProfiles(category);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t('model.title') }} />
      <FlatList
        data={profiles.data ?? []}
        keyExtractor={(p) => p.item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshing={profiles.isRefetching}
        onRefresh={() => void profiles.refetch()}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
            <DataBanner detailed />
            <Body muted>{t('model.intro')}</Body>
            <Card>
              <Title style={{ fontSize: 15 }}>{t('model.legendTitle')}</Title>
              <Small>{t('model.legendKnown')}</Small>
              <Small>{t('model.legendConsumed')}</Small>
              <Small>{t('model.legendPreference')}</Small>
            </Card>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              <FilterChip label={t('model.all')} selected={!category} color={c.accent} onPress={() => setCategory(undefined)} />
              {CATEGORIES.map((code) => (
                <FilterChip
                  key={code}
                  label={t(`categories.${code}`)}
                  selected={category === code}
                  color={CATEGORY_META[code].color}
                  onPress={() => setCategory(code)}
                />
              ))}
            </ScrollView>
            {profiles.data ? <Small style={{ fontWeight: '700' }}>{t('model.count', { count: profiles.data.length })}</Small> : null}
            {profiles.isLoading ? <Loading /> : null}
            {profiles.isError ? <ErrorCard error={profiles.error} onRetry={() => void profiles.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={profiles.isSuccess ? <Body muted>{t('model.empty')}</Body> : null}
        renderItem={({ item }) => (
          <ProfileRow profile={item} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.item.id } })} />
        )}
      />
    </View>
  );
}
