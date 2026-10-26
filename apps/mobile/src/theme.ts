import { Platform } from 'react-native';
import { create } from 'zustand';

/**
 * Tokens de la dirección «Aura» (docs/design/aura/, decisions.md 2026-10-26).
 * - Chispa (coral): solo la acción principal. Lima: solo afinidad y almas gemelas. Ámbar: NEW y datos de ejemplo.
 * - Los 8 colores de categoría tiñen el halo y las portadas generadas; nunca son el fondo de un texto.
 * - Cada relleno va con su texto (`on*`); todos los pares superan AA (4,5:1) en ambos temas (contraste calculado).
 * - Oscuro por defecto; el claro queda disponible con `useThemeMode`.
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
  /** Chispa: relleno de la acción principal. */
  accent: '#FF5E4D',
  accentText: '#1A0806',
  /** Chispa como texto o icono (botones secundarios, enlaces). */
  primaryInk: '#B42318',
  primaryContainer: '#FFE3DE',
  onPrimaryContainer: '#6B1A12',
  /** Lima: afinidad y almas gemelas (en claro, un verde oliva legible). */
  affinity: '#4D6A00',
  onAffinity: '#FFFFFF',
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
  /** Fondo del halo: el color de la categoría se mezcla con esto. */
  auraBase: '#F6F4F1',
};

const dark: typeof light = {
  background: '#0C0C0E',
  surface: '#17161B',
  surfaceRaised: '#211F27',
  surfaceAlt: '#26242C',
  onSurfaceAlt: '#D6D2CC',
  text: '#F5F3F0',
  textMuted: '#B4B0AA',
  textSubtle: '#938F88',
  border: '#34323A',
  hairline: 'rgba(255,255,255,0.08)',
  scrim: 'rgba(5,5,6,0.66)',
  accent: '#FF5E4D',
  accentText: '#1A0806',
  primaryInk: '#FF8A7D',
  primaryContainer: '#3A1A17',
  onPrimaryContainer: '#FFD5CF',
  affinity: '#D4F45A',
  onAffinity: '#141A02',
  secondary: '#E8B04B',
  onSecondary: '#1F1606',
  demo: '#E8B04B',
  demoBg: '#3A2A0A',
  ok: '#4CC38A',
  warn: '#F2B33D',
  danger: '#FF7A70',
  positive: '#4CC38A',
  negative: '#FF7A70',
  neutral: '#B4B0AA',
  auraBase: '#0C0C0E',
};

export type Palette = typeof light;
export type ThemeMode = 'dark' | 'light';

/** Tema elegido (oscuro por defecto). */
export const useThemeMode = create<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>((set) => ({
  mode: 'dark',
  setMode: (mode) => set({ mode }),
}));

export function usePalette(): Palette {
  return useThemeMode((s) => s.mode) === 'light' ? light : dark;
}

/** Texto e iconos sobre imagen: siempre claros, sobre el velo oscuro de la tarjeta (contraste garantizado). */
export const onImage = { text: '#F5F3F0', muted: 'rgba(245,243,240,0.82)', glass: 'rgba(12,12,14,0.66)', reasonIcon: '#D4F45A' };

/**
 * Bricolage Grotesque (Google Fonts, OFL) solo para titulares, títulos de obras y cifras; el resto, la fuente del
 * sistema. `displayHeavy` para la marca, el título de la tarjeta y las cifras grandes.
 */
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

/**
 * Escala tipográfica («Aura», misma escala que la guía docs/design/design-system): usar estos pasos en lugar de
 * tamaños sueltos. `display`/`h1`/`h2`/`figure` en Bricolage grueso; `h3`/`h4` en Bricolage; el resto, fuente del sistema.
 */
export const type = {
  display: { fontFamily: fonts.displayHeavy, fontSize: 40, lineHeight: 42, letterSpacing: -1.4 },
  figure: { fontFamily: fonts.displayHeavy, fontSize: 64, lineHeight: 66, letterSpacing: -2.5 },
  h1: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 33, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },
  h3: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  h4: { fontFamily: fonts.display, fontSize: 17, lineHeight: 21, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 21 },
  bodySm: { fontSize: 14, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 17 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, xl: 30, full: 999 };

/** Movimiento: elástico al soltar (como en la maqueta); se omite si el sistema pide reducir movimiento. */
export const motion = { spring: { friction: 6, tension: 70 }, auraFadeMs: 500 };
