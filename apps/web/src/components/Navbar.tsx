'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';
import { Logo } from './Logo';

// Public pages only (landing, login, register). The signed-in areas have their own navigation.
export function Navbar() {
  const { t, lang, toggleLang, theme, toggleTheme } = usePrefs();
  const path = usePathname();
  const [authed, setAuthed] = useState(false);
  useEffect(() => { supabase().auth.getSession().then(({ data }) => setAuthed(!!data.session)); }, [path]);
  if (/^\/(admin|dashboard|store|services|cases|account|notifications)/.test(path)) return null;

  const btn = 'grid h-9 min-w-9 place-items-center rounded-full border px-2 text-sm transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-cyan-accent';
  return (
    <header className="sticky top-0 z-40 border-b bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="leading-tight"><span className="block font-bold">{t('brand')}</span><span className="block text-xs text-muted">{t('brandSub')}</span></span>
        </Link>
        <div className="mx-auto hidden gap-6 text-sm text-muted md:flex">
          <a href="/#services" className="hover:text-fg">{t('navServices')}</a>
          <a href="/#process" className="hover:text-fg">{t('navProcess')}</a>
          <a href="/#payment" className="hover:text-fg">{t('navPayment')}</a>
        </div>
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <button onClick={toggleLang} className={btn} aria-label="Language">{lang === 'ar' ? 'EN' : 'ع'}</button>
          <button onClick={toggleTheme} className={btn} aria-label="Theme">{theme === 'dark' ? '☀' : '☾'}</button>
          {authed ? (
            <Link href="/dashboard" className="rounded-full bg-navy-900 px-4 py-1.5 text-sm font-medium text-white">{t('goApp')}</Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-full px-3 py-1.5 text-sm hover:bg-surface sm:block">{t('login')}</Link>
              <Link href="/register" className="rounded-full bg-navy-900 px-4 py-1.5 text-sm font-medium text-white">{t('register')}</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
