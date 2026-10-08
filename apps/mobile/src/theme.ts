import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F4F1',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEBE6',
  text: '#1C1A19',
  textMuted: '#6B6560',
  border: '#E2DCD5',
  accent: '#5B3FD9',
  accentText: '#FFFFFF',
  demo: '#B45309',
  demoBg: '#FEF3C7',
  ok: '#15803D',
  warn: '#B45309',
  danger: '#B91C1C',
  positive: '#15803D',
  negative: '#B91C1C',
  neutral: '#6B6560',
};

const dark: typeof light = {
  background: '#121110',
  surface: '#1E1C1A',
  surfaceAlt: '#2A2724',
  text: '#F3F0EC',
  textMuted: '#A8A19A',
  border: '#36322E',
  accent: '#8E78F0',
  accentText: '#121110',
  demo: '#FBBF24',
  demoBg: '#3A2A0A',
  ok: '#4ADE80',
  warn: '#FBBF24',
  danger: '#F87171',
  positive: '#4ADE80',
  negative: '#F87171',
  neutral: '#A8A19A',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18 };
