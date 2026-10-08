import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useItemProfiles, useMe } from '../../src/api/queries';
import { Body, Button, Card, PendingNotice, Screen, Small, Title } from '../../src/components/ui';
import { DataBanner } from '../../src/components/DataBanner';
import { spacing } from '../../src/theme';

/**
 * Home. El carrusel de recomendaciones (descartar, deshacer, conservar, NEW) llega en la fase 8; hasta entonces
 * no se muestran recomendaciones ni puntuaciones inventadas. Desde aquí se accede a la demo del modelo.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const profiles = useItemProfiles();
  return (
    <Screen
      refreshing={me.isRefetching || profiles.isRefetching}
      onRefresh={() => {
        void me.refetch();
        void profiles.refetch();
      }}
    >
      <DataBanner detailed />
      <Animated.View entering={FadeInDown.duration(350)}>
        <Card>
          <Title>{t('home.learning')}</Title>
          {me.data ? (
            <Body muted>
              @{me.data.user.handle}
              {profiles.data ? ` · ${t('model.count', { count: profiles.data.length })}` : ''}
            </Body>
          ) : null}
          <PendingNotice phase="7–8" text={t('home.recommendationsPending')} />
        </Card>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(350)}>
        <Card>
          <Title style={{ fontSize: 16 }}>{t('home.whatYouCanTest')}</Title>
          <View style={{ gap: spacing.xs }}>
            <Small>• {t('home.testKnown')}</Small>
            <Small>• {t('home.testImages')}</Small>
            <Small>• {t('home.testSync')}</Small>
          </View>
          <Button label={t('home.openModel')} icon="database-search-outline" onPress={() => router.push('/model')} />
          <Button label={t('home.openCategories')} icon="shape-outline" variant="secondary" onPress={() => router.push('/categories')} />
          <Button label={t('home.openSources')} icon="link-variant" variant="secondary" onPress={() => router.push('/profile')} />
        </Card>
      </Animated.View>
    </Screen>
  );
}
