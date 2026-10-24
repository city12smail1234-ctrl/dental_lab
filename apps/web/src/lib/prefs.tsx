'use client';
import { MotionConfig } from 'motion/react';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { dict, Lang } from './dict';

type Theme = 'light' | 'dark';
type Ctx = { lang: Lang; toggleLang: () => void; t: (k: string) => string; theme: Theme; toggleTheme: () => void };
const C = createContext<Ctx>(null!);
export const usePrefs = () => useContext(C);

export function Providers({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('ar');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const l = localStorage.getItem('lang');
    if (l === 'ar' || l === 'en') setLang(l);
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const toggleLang = useCallback(() => {
    const n: Lang = lang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('lang', n); setLang(n);
  }, [lang]);

  const toggleTheme = useCallback(() => {
    const n: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', n === 'dark');
    localStorage.setItem('theme', n); setTheme(n);
  }, [theme]);

  const t = useCallback((k: string) => dict[lang][k] ?? k, [lang]);

  return (
    <C.Provider value={{ lang, toggleLang, t, theme, toggleTheme }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </C.Provider>
  );
}
