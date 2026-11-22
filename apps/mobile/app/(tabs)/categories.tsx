import { CATEGORIES, CATEGORY_META } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Body, Card, CategoryIcon, Screen, Small, Title } from '../../src/components/ui';
import { spacing } from '../../src/theme';

/** Las ocho categorías del MVP con su icono, color y alcance (local o global). */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Body muted>{t('categoriesScreen.subtitle')}</Body>
      {CATEGORIES.map((category) => (
        <Card key={category} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <CategoryIcon category={category} />
          <View style={{ flex: 1, gap: 2 }}>
            <Title style={{ fontSize: 16, color: CATEGORY_META[category].color }}>{t(`categories.${category}`)}</Title>
            <Body>{t(`categoryObject.${category}`)}</Body>
            <Small>{t(`scope.${CATEGORY_META[category].scope}`)}</Small>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
