import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { rememberInvite, takePendingInvite } from '../src/invite';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMe } from '../src/api/queries';
import { initI18n } from '../src/i18n';
import { useSession } from '../src/state/session';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, useFonts } from '@expo-google-fonts/space-grotesk';
import { fonts, usePalette, useThemeMode } from '../src/theme';

const i18n = initI18n();
// Cierra la ventana de autenticación al volver del proveedor (necesario en web; inocuo en iOS/Android).
WebBrowser.maybeCompleteAuthSession();

function SessionGate() {
  const { hydrated, session, hydrate } = useSession();
  const segments = useSegments();
  const pathname = usePathname();
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
    // /auth recibe la vuelta de Google antes de que haya sesión.
    const onAuthReturn = segments[0] === 'auth';
    // Un enlace de invitación sin sesión se recuerda y se retoma después de entrar (o del alta).
    const inviteCode = /^\/invite\/([a-z0-9]{10})$/i.exec(pathname)?.[1];
    if (!session && inviteCode) rememberInvite(inviteCode.toLowerCase());
    if (!session && !onLogin && !onAuthReturn) router.replace('/dev-login');
    if (session && onLogin) router.replace('/');
  }, [hydrated, session, segments, router, pathname]);

  // Alta pendiente (cuenta real nueva): primero mayoría de edad y condiciones.
  const needsOnboarding = me.data?.needsOnboarding ?? false;
  useEffect(() => {
    if (session && needsOnboarding && segments[0] !== 'onboarding') router.replace('/onboarding');
    if (session && me.data && !needsOnboarding && segments[0] !== 'invite') {
      const invite = takePendingInvite();
      if (invite) router.replace(`/invite/${invite}`);
    }
  }, [session, needsOnboarding, segments, router, me.data]);

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
  const mode = useThemeMode((s) => s.mode);
  // Space Grotesk se carga sin bloquear: hasta entonces, los titulares usan la fuente del sistema.
  useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_700Bold });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <SessionGate />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.background },
              headerShadowVisible: false,
              headerTintColor: c.text,
              headerTitleStyle: { fontFamily: fonts.display },
              contentStyle: { backgroundColor: c.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="dev-login" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false, title: 'APPINITY' }} />
            <Stack.Screen name="model" />
            <Stack.Screen name="category/[code]" />
            <Stack.Screen name="item/[id]" />
            <Stack.Screen name="person/[id]" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="match/[id]" options={{ presentation: 'modal', headerShown: false }} />
          </Stack>
        </QueryClientProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}
