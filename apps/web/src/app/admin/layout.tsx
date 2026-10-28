'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { NotificationBell } from '@/components/NotificationBell';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 7M19 21a7 7 0 0 0-3-5.7',
  clip: 'M9 3h6v3H9zM6 5h12v16H6zM9 11h6M9 15h6',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  tag: 'M3 12V3h9l9 9-9 9zM8 8h.01',
  truck: 'M2 6h12v10H2zM14 10h5l3 3v3h-8M6 19.5a1.5 1.5 0 1 0 .01 0M18 19.5a1.5 1.5 0 1 0 .01 0',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h3M2 12h3M12 2v3M12 19v3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M17 14h2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};
const Icon = ({ n, s = 18 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n]} /></svg>
);

// roles = who may open the page (super_admin always can); they mirror the API's role checks
type Item = { k: string; href: string; icon: string; roles: string[]; badge?: string };
const GROUPS: { h: string; items: Item[] }[] = [
  { h: '', items: [{ k: 'aOverview', href: '/admin', icon: 'home', roles: ['lab_manager'] }] },
  { h: 'ngOps', items: [
    { k: 'aDoctors', href: '/admin/doctors', icon: 'users', roles: ['lab_manager'], badge: 'doctors' },
    { k: 'aCases', href: '/admin/cases', icon: 'clip', roles: ['lab_manager', 'technician'], badge: 'cases' },
    { k: 'aOrders', href: '/admin/orders', icon: 'box', roles: ['lab_manager', 'order_manager', 'accountant'], badge: 'orders' },
    { k: 'aDeliveries', href: '/admin/deliveries', icon: 'truck', roles: ['lab_manager', 'delivery_coordinator', 'delivery_staff'], badge: 'deliveries' },
  ] },
  { h: 'ngCatalog', items: [
    { k: 'aProducts', href: '/admin/products', icon: 'box', roles: ['lab_manager', 'inventory_manager'] },
    { k: 'aPrices', href: '/admin/prices', icon: 'tag', roles: ['lab_manager'] },
  ] },
  { h: 'ngBusiness', items: [
    { k: 'aDues', href: '/admin/payments', icon: 'wallet', badge: 'dues', roles: ['lab_manager', 'accountant'] },
    { k: 'aAccounts', href: '/admin/accounts', icon: 'wallet', roles: ['lab_manager', 'accountant'] },
    { k: 'aReports', href: '/admin/reports', icon: 'chart', roles: ['lab_manager', 'accountant'] },
    { k: 'aStaff', href: '/admin/staff', icon: 'users', roles: [] },
    { k: 'aAudit', href: '/admin/audit', icon: 'shield', roles: ['lab_manager'] },
    { k: 'aSettings', href: '/admin/settings', icon: 'cog', roles: ['lab_manager'] },
  ] },
];
const TAB_ORDER = ['/admin', '/admin/cases', '/admin/orders', '/admin/deliveries', '/admin/doctors'];
const ALL = GROUPS.flatMap((g) => g.items);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { t, lang, toggleLang, theme, toggleTheme } = usePrefs();
  const [me, setMe] = useState<{ email: string; roles: string[] } | null>(null);
  const [more, setMore] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) return router.replace('/login');
      try {
        const m = await api<{ email?: string; roles: string[] }>('/auth/me');
        if (!m.roles.some((r) => r !== 'doctor')) return router.replace('/dashboard');
        setMe({ email: m.email ?? '', roles: m.roles });
      } catch { router.replace('/login'); }
    })();
  }, [router]);
  useEffect(() => setMore(false), [path]);

  const can = useCallback((i: Item) => !!me && (me.roles.includes('super_admin') || (i.roles.length > 0 && i.roles.some((r) => me.roles.includes(r)))), [me]);

  // staff without access to the overview land on the first page they can open
  useEffect(() => {
    if (!me || path !== '/admin') return;
    const overview = ALL.find((i) => i.href === '/admin')!;
    if (!can(overview)) { const first = ALL.find((i) => can(i)); if (first) router.replace(first.href); }
  }, [me, path, can, router]);

  const loadBadges = useCallback(() => {
    api<{ counts: Record<string, number> }>('/admin/diagnostics').then((d) => setBadges((b) => ({ ...b, orders: d.counts.orders_pending, cases: d.counts.cases_new, deliveries: d.counts.deliveries_new, dues: d.counts.dues_pending }))).catch(() => {});
    api<{ doctors: Record<string, number> }>('/admin/stats').then((d) => setBadges((b) => ({ ...b, doctors: d.doctors.pending }))).catch(() => {});
  }, []);
  useEffect(() => { if (me) loadBadges(); }, [me, loadBadges]);
  usePolling(loadBadges);

  if (!me) return <div className="grid min-h-screen place-items-center text-muted">{t('aLoading')}</div>;

  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/'));
  const current = ALL.filter((i) => isActive(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const title = path.startsWith('/admin/notifications') ? t('ntTitle') : current ? t(current.k) : t('aAdminTitle');
  const round = 'grid h-9 min-w-9 place-items-center rounded-full border px-2 text-sm hover:bg-surface';
  const signOut = async () => { await supabase().auth.signOut(); router.push('/login'); };
  const tabs = TAB_ORDER.map((h) => ALL.find((i) => i.href === h)!).filter(can).slice(0, 4);
  const Badge = ({ n }: { n?: number }) => (n ? <span className="ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-cyan-accent px-1.5 text-[11px] font-semibold text-[#06101f]">{n > 99 ? '99+' : n}</span> : null);

  const NavList = ({ onPick }: { onPick?: () => void }) => (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const items = g.items.filter(can);
        if (!items.length) return null;
        return (
          <div key={g.h || 'top'} className="space-y-1">
            {g.h && <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted">{t(g.h)}</p>}
            {items.map((n) => (
              <Link key={n.k} href={n.href} onClick={onPick} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive(n.href) ? 'bg-navy-900 font-medium text-white' : 'text-muted hover:bg-surface hover:text-fg'}`}>
                <Icon n={n.icon} />{t(n.k)}<Badge n={n.badge ? badges[n.badge] : 0} />
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-e p-4 md:sticky md:top-0 md:flex md:h-screen">
        <Link href="/admin" className="mb-5 flex items-center gap-2 px-2">
          <Logo size={32} />
          <span className="leading-tight"><span className="block font-bold">{t('brand')}</span><span className="block text-xs text-muted">{t('aAdminTitle')}</span></span>
        </Link>
        <nav className="flex-1 overflow-y-auto" aria-label="admin"><NavList /></nav>
        <p className="mt-3 truncate border-t pt-3 text-xs text-muted" dir="ltr">{me.email}</p>
        <p className="mt-1 truncate text-xs text-muted">{me.roles.filter((r) => r !== 'doctor').map((r) => t(`rl_${r}`)).join(' · ')}</p>
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-bg/85 px-4 backdrop-blur md:px-8">
          <Link href="/admin" className="flex items-center gap-2 md:hidden"><Logo size={26} /></Link>
          <h2 className="truncate font-semibold">{title}</h2>
          <div className="ms-auto flex items-center gap-2">
            <NotificationBell allHref="/admin/notifications" />
            <Link href="/dashboard" className="hidden rounded-full border px-3 py-1.5 text-sm hover:bg-surface sm:block">{t('aDoctorSite')}</Link>
            <button onClick={toggleLang} className={round} aria-label="Language">{lang === 'ar' ? 'EN' : 'ع'}</button>
            <button onClick={toggleTheme} className={round} aria-label="Theme">{theme === 'dark' ? '☀' : '☾'}</button>
            <button onClick={signOut} className="hidden text-sm text-muted hover:text-fg md:block">{t('aSignOut')}</button>
          </div>
        </header>
        <main className="p-5 md:p-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-bg/95 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, 1fr)` }} aria-label="tabs">
        {tabs.map((it) => {
          const n = it.badge ? badges[it.badge] : 0;
          return (
            <Link key={it.href} href={it.href} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(it.href) ? 'text-cyan-accent' : 'text-muted'}`}>
              <Icon n={it.icon} s={20} />{t(it.k)}
              {n > 0 && <span className="absolute end-[22%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-cyan-accent px-1 text-[10px] font-semibold text-[#06101f]">{n}</span>}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted"><Icon n="more" s={20} />{t('aMore')}</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] space-y-4 overflow-y-auto rounded-t-3xl border bg-bg p-5">
            <NavList onPick={() => setMore(false)} />
            <div className="flex items-center justify-between border-t pt-4">
              <Link href="/dashboard" className="text-sm text-cyan-accent">{t('aDoctorSite')}</Link>
              <button onClick={signOut} className="text-sm text-muted">{t('aSignOut')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
