import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useApp } from '@/store/app';
import { dark, light, type Palette } from './tokens';

interface Theme {
  c: Palette;
  isDark: boolean;
  reduceMotion: boolean;
}

const ThemeCtx = createContext<Theme>({ c: light, isDark: false, reduceMotion: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = useApp((s) => s.settings.theme);
  const reduceMotion = useReducedMotion();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  const value = useMemo(() => ({ c: isDark ? dark : light, isDark, reduceMotion }), [isDark, reduceMotion]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
