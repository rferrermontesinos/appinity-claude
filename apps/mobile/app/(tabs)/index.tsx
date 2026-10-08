import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMe } from '../../src/api/queries';
import { Body, Card, DemoBanner, PendingNotice, Screen, Title } from '../../src/components/ui';

/**
 * Home. El carrusel de recomendaciones (descartar, deshacer, conservar, NEW) llega en la fase 8;
 * hasta entonces no se muestran recomendaciones ni puntuaciones inventadas.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <DemoBanner detailed />
      <Animated.View entering={FadeInDown.duration(350)}>
        <Card>
          <Title>{t('home.learning')}</Title>
          {me.data ? <Body muted>@{me.data.user.handle}</Body> : null}
          <PendingNotice phase="7–8" text={t('home.recommendationsPending')} />
        </Card>
      </Animated.View>
    </Screen>
  );
}
