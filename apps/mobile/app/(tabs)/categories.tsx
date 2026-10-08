import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORIES, CATEGORY_META } from '@appinity/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Body, Card, CategoryIcon, Screen, Small, Title } from '../../src/components/ui';
import { radius, spacing, usePalette } from '../../src/theme';

/** Las ocho categorías del MVP con su icono, color y alcance (local o global). */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  return (
    <Screen>
      <Body muted>{t('categoriesScreen.subtitle')}</Body>
      {CATEGORIES.map((category) => (
        <Pressable
          key={category}
          accessibilityRole="button"
          accessibilityLabel={t(`categories.${category}`)}
          onPress={() => router.push({ pathname: '/category/[code]', params: { code: category } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, borderRadius: radius.md })}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <CategoryIcon category={category} />
            <View style={{ flex: 1, gap: 2 }}>
              <Title style={{ fontSize: 16, color: CATEGORY_META[category].color }}>{t(`categories.${category}`)}</Title>
              <Body>{t(`categoryObject.${category}`)}</Body>
              <Small>{t(`scope.${CATEGORY_META[category].scope}`)}</Small>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={c.textMuted} />
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
