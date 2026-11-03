import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SourcesCard } from '../src/components/SourcesCard';
import { Screen } from '../src/components/ui';

/** Fuentes en su propia pantalla (2026-10-26): conectar, renovar, sincronizar y desconectar. */
export default function SourcesScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('sources.title') }} />
      <SourcesCard />
    </Screen>
  );
}
