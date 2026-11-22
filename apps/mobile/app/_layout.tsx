import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMe } from '../src/api/queries';
import { initI18n } from '../src/i18n';
import { useSession } from '../src/state/session';
import { usePalette } from '../src/theme';

const i18n = initI18n();
// Cierra la ventana de autenticación al volver del proveedor (necesario en web; inocuo en iOS/Android).
WebBrowser.maybeCompleteAuthSession();

function SessionGate() {
  const { hydrated, session, hydrate } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const me = useMe();
  const { i18n: i18next } = useTranslation();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Sin sesión de desarrollo, la única pantalla accesible es la elección de usuario de demo.
  useEffect(() => {
    if (!hydrated) return;
    const onLogin = segments[0] === 'dev-login';
    if (!session && !onLogin) router.replace('/dev-login');
    if (session && onLogin) router.replace('/');
  }, [hydrated, session, segments, router]);

  // El idioma guardado en los ajustes del usuario prevalece sobre el del sistema.
  const locale = me.data?.settings.locale;
  useEffect(() => {
    if (locale && i18next.language !== locale) void i18next.changeLanguage(locale);
  }, [locale, i18next]);

  return null;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  const c = usePalette();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <SessionGate />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.surface },
              headerTintColor: c.text,
              contentStyle: { backgroundColor: c.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="dev-login" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="model" />
            <Stack.Screen name="category/[code]" />
            <Stack.Screen name="item/[id]" />
          </Stack>
        </QueryClientProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}
