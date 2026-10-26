import { Platform } from 'react-native';
import { create } from 'zustand';

/**
 * Tokens del sistema de diseño «Noche de cine» (docs/design/design-system/styles.css, fuente de verdad).
 * - El violeta es la única familia de interacción (afinidad y acción principal); el ámbar, lo nuevo.
 * - Cada relleno va con su texto (`on*`); todos los pares superan AA (4,5:1) en ambos temas.
 * - Oscuro por defecto (dirección A); el claro queda disponible con `useThemeMode`.
 * Las claves antiguas (accent, textMuted, surfaceAlt…) se conservan como alias para no romper pantallas.
 */
const light = {
  background: '#F6F4F1',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceAlt: '#EFEBE6',
  onSurfaceAlt: '#4A443E',
  text: '#1D1A17',
  textMuted: '#5F574F',
  textSubtle: '#7C7268',
  border: '#E1DAD2',
  hairline: 'rgba(29,26,23,0.08)',
  scrim: 'rgba(29,26,23,0.48)',
  accent: '#5B3FD9',
  accentText: '#FFFFFF',
  primaryInk: '#4A2FC4',
  primaryContainer: '#E9E4FF',
  onPrimaryContainer: '#2A1A78',
  secondary: '#9A5F00',
  onSecondary: '#FFFFFF',
  demo: '#9A5F00',
  demoBg: '#FDF1DC',
  ok: '#1D7F4E',
  warn: '#9A5F00',
  danger: '#C2362B',
  positive: '#1D7F4E',
  negative: '#C2362B',
  neutral: '#5F574F',
};

const dark: typeof light = {
  background: '#121110',
  surface: '#1C1A18',
  surfaceRaised: '#262320',
  surfaceAlt: '#2A2724',
  onSurfaceAlt: '#D2C9BF',
  text: '#F3EEE8',
  textMuted: '#B5ABA0',
  textSubtle: '#8E857B',
  border: '#3A3531',
  hairline: 'rgba(243,238,232,0.08)',
  scrim: 'rgba(8,7,6,0.64)',
  accent: '#8E78F0',
  accentText: '#120F1F',
  primaryInk: '#B3A6F7',
  primaryContainer: '#2C2547',
  onPrimaryContainer: '#DCD5FF',
  secondary: '#E8B04B',
  onSecondary: '#1F1606',
  demo: '#E8B04B',
  demoBg: '#3A2A0A',
  ok: '#4CC38A',
  warn: '#F2B33D',
  danger: '#FF7A70',
  positive: '#4CC38A',
  negative: '#FF7A70',
  neutral: '#B5ABA0',
};

export type Palette = typeof light;
export type ThemeMode = 'dark' | 'light';

/** Tema elegido (oscuro por defecto, dirección A). */
export const useThemeMode = create<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>((set) => ({
  mode: 'dark',
  setMode: (mode) => set({ mode }),
}));

export function usePalette(): Palette {
  return useThemeMode((s) => s.mode) === 'light' ? light : dark;
}

/** Texto e iconos sobre imagen: siempre claros, sobre el velo oscuro de la tarjeta (contraste garantizado). */
export const onImage = { text: '#F3EEE8', muted: 'rgba(243,238,232,0.8)', glass: 'rgba(18,17,16,0.58)', reasonIcon: '#C9BEFF' };

/** Space Grotesk solo para titulares, títulos de obras y cifras; el resto, la fuente del sistema. */
export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, xl: 28, full: 999 };
