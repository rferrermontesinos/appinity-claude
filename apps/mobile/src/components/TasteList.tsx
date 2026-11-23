import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_META, type TasteItemDto } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useDefiningTastes, useSharedTastes } from '../api/queries';
import { useOpenItem } from '../catalog/openItem';
import { radius, spacing, type, usePalette } from '../theme';
import { CatalogImage } from './CatalogImage';
import { Card, Small } from './ui';

/** Fila de una obra: miniatura, título, categoría y, si lo es, «Rara» o «Poco común». Un toque abre su ficha. */
function TasteRow({ entry }: { entry: TasteItemDto }) {
  const { t } = useTranslation();
  const c = usePalette();
  const openItem = useOpenItem();
  const { item, rarity } = entry;
  const meta = CATEGORY_META[item.category];
  const category = t(`categories.${item.category}`);
  const rarityText = rarity ? t(`people.rarity.${rarity}`) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.title, category, rarityText].filter(Boolean).join('. ')}
      onPress={() => openItem(item.id)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 48, height: 48, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surfaceAlt }}>
        <CatalogImage
          image={item.primaryImage}
          category={item.category}
          title={item.title}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <MaterialCommunityIcons name={meta.icon as never} size={14} color={meta.color} />
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{category}</Text>
          {rarityText ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                marginLeft: spacing.xs,
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: radius.full,
                backgroundColor: c.surfaceAlt,
              }}
            >
              <MaterialCommunityIcons name="diamond-stone" size={12} color={c.affinity} />
              <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>{rarityText}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={c.textSubtle} />
    </Pressable>
  );
}

/**
 * «Lo que os une» (ficha de persona, 2026-10-27): hasta 5 obras que os gustan a los dos, las menos comunes primero.
 * Si la otra persona lo ha desactivado no se muestra nada; si lo has desactivado tú, se dice dónde activarlo.
 */
export function SharedTastes({ userId, surface }: { userId: string; surface?: string }) {
  const { t } = useTranslation();
  const c = usePalette();
  const shared = useSharedTastes(userId);
  const data = shared.data;
  if (!data || data.status === 'off_them') return null;
  return (
    <Card style={surface ? { backgroundColor: surface } : undefined}>
      <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
        {t('people.sharedTitle')}
      </Text>
      {data.status === 'off_you' ? (
        <Small>{t('people.sharedOffYou')}</Small>
      ) : data.items.length ? (
        <>
          <Small>{t('people.sharedHint')}</Small>
          <View style={{ gap: spacing.sm }}>
            {data.items.map((entry) => (
              <TasteRow key={entry.item.id} entry={entry} />
            ))}
          </View>
          {data.total > data.items.length ? <Small>{t('people.sharedMore', { count: data.total - data.items.length })}</Small> : null}
        </>
      ) : (
        <Small>{t('people.sharedNone')}</Small>
      )}
    </Card>
  );
}

/** «Lo que te define» (Perfil): tus obras con más gusto y menos conocidas, como mucho 2 por categoría. Solo la ves tú. */
export function DefiningCard() {
  const { t } = useTranslation();
  const c = usePalette();
  const defining = useDefiningTastes();
  const items = defining.data?.items ?? [];
  if (!items.length) return null;
  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
        {t('people.definingTitle')}
      </Text>
      <Small>{t('people.definingHint')}</Small>
      <View style={{ gap: spacing.sm }}>
        {items.map((entry) => (
          <TasteRow key={entry.item.id} entry={entry} />
        ))}
      </View>
    </Card>
  );
}
