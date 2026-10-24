'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CartProvider, useCart } from '@/lib/cart';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

const ICON: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  clip: 'M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h6',
  tag: 'M3 12V3h9l9 9-9 9zM8 8h.01',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M17 14h2',
  cart: 'M3 4h2l2.4 10.5a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6M9 19.5h.01M17 19.5h.01',
};
const Icon = ({ n, s = 20 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[n]} /></svg>
);

const LINKS = [
  { href: '/dashboard', k: 'nvHome', icon: 'home', tab: true },
  { href: '/cases', k: 'nvCases', icon: 'clip', tab: true },
  { href: '/services', k: 'nvPrices', icon: 'tag', tab: true },
  { href: '/store', k: 'nvStore', icon: 'box', tab: true },
  { href: '/store/orders', k: 'nvOrders', icon: 'receipt', tab: false },
  { href: '/account', k: 'nvAccount', icon: 'wallet', tab: true },
];

function Inner({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t, lang, toggleLang, theme, toggleTheme } = usePrefs();
  const { cart } = useCart();
  const [staff, setStaff] = useState(false);
  const count = cart.items.reduce((a, i) => a + i.quantity, 0);

  useEffect(() => { api<{ roles: string[] }>('/auth/me').then((m) => setStaff(m.roles.some((r) => r !== 'doctor'))).catch(() => {}); }, []);

  const active = LINKS.filter((l) => path === l.href || path.startsWith(l.href + '/')).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const round = 'grid h-9 min-w-9 place-items-center rounded-full border px-2 text-sm hover:bg-surface';

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/dashboard" className="flex items-center gap-2"><Logo size={30} /><span className="hidden font-bold sm:block">{t('brand')}</span></Link>
          <nav className="mx-4 hidden items-center gap-1 md:flex" aria-label="main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${active === l.href ? 'bg-navy-900 font-medium text-white' : 'text-muted hover:bg-surface hover:text-fg'}`}>{t(l.k)}</Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            {staff && <Link href="/admin" className="hidden rounded-full border px-3 py-1.5 text-sm hover:bg-surface sm:block">{t('nvAdmin')}</Link>}
            <NotificationBell allHref="/notifications" />
            <Link href="/store/cart" className={`${round} relative`} aria-label={t('nvCart')}>
              <Icon n="cart" s={18} />
              {count > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-cyan-accent px-1 text-[11px] font-semibold text-[#06101f]">{count}</span>}
            </Link>
            <button onClick={toggleLang} className={round} aria-label="Language">{lang === 'ar' ? 'EN' : 'ع'}</button>
            <button onClick={toggleTheme} className={round} aria-label="Theme">{theme === 'dark' ? '☀' : '☾'}</button>
            <button onClick={async () => { await supabase().auth.signOut(); router.push('/login'); }} className="hidden text-sm text-muted hover:text-fg md:block">{t('dbLogout')}</button>
          </div>
        </div>
      </header>

      {children}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-bg/95 backdrop-blur md:hidden" aria-label="tabs">
        {LINKS.filter((l) => l.tab).map((l) => (
          <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active === l.href ? 'text-cyan-accent' : 'text-muted'}`}>
            <Icon n={l.icon} />{t(l.k)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function DoctorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => { supabase().auth.getSession().then(({ data }) => (data.session ? setOk(true) : router.replace('/login'))); }, [router]);
  if (!ok) return null;
  return <CartProvider><Inner>{children}</Inner></CartProvider>;
}
