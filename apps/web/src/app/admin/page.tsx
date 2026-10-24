'use client';
import Link from 'next/link';
import { animate } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type Recent = { user_id: string; status: string; clinic_name: string | null; created_at: string; profiles: { full_name: string | null; email: string | null } | null };
type Act = { id: number; action: string; details: { from?: string; to?: string }; created_at: string };
type Diag = { missing: string[]; counts: Record<string, number> };
type Stats = { doctors: Record<string, number>; recent: Recent[]; activity: Act[] };

const TONE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-300',
  suspended: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
};
const BAR: Record<string, string> = { pending: 'bg-amber-500', approved: 'bg-emerald-500', suspended: 'bg-orange-500', rejected: 'bg-red-500' };

function Count({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const c = animate(0, to, { duration: 0.8, ease: 'easeOut', onUpdate: (v) => { if (ref.current) ref.current.textContent = String(Math.round(v)); } });
    return () => c.stop();
  }, [to]);
  return <span ref={ref}>0</span>;
}

export default function Overview() {
  const { t, lang } = usePrefs();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  const [diag, setDiag] = useState<Diag | null>(null);
  useEffect(() => { api<Stats>('/admin/stats').then(setS).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { const run = () => api<Diag>('/admin/diagnostics').then(setDiag).catch(() => {}); run(); const id = setInterval(run, 15000); return () => clearInterval(id); }, []);

  if (err) return <p className="text-red-500">{err}</p>;
  if (!s) return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />)}</div>;

  const d = s.doctors;
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  const order = ['pending', 'approved', 'suspended', 'rejected'];
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{t('aOverview')}</h1>
        <p className="mt-1 text-muted">{t('aSub')}</p>
      </div>

      {d.pending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p><b>{d.pending}</b> {t('aAwait')}</p>
          <Link href="/admin/doctors" className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('aReview')}</Link>
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[['total', total], ['pending', d.pending], ['approved', d.approved], ['suspended', d.suspended]].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl border bg-surface p-5">
            <p className="text-sm text-muted">{k === 'total' ? t('aTotal') : t(`st_${k}`)}</p>
            <p className="mt-2 text-4xl font-semibold" dir="ltr"><Count to={v as number} /></p>
          </div>
        ))}
      </section>

      {diag && diag.missing.length > 0 && (
        <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <p className="font-medium">{t('ovWarn')}</p>
          <p className="mt-1" dir="ltr">{diag.missing.join(' · ')}</p>
          <p className="mt-1 text-muted">{t('ovWarnHow')}</p>
        </div>
      )}
      {diag && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {([['ovOrders', 'orders_pending', '/admin/orders'], ['ovCasesNew', 'cases_new', '/admin/cases'], ['ovDeliveries', 'deliveries_new', '/admin/deliveries'], ['ovCasesOpen', 'cases_open', '/admin/cases'], ['ovProducts', 'products_active', '/admin/products'], ['ovLow', 'products_low', '/admin/products'], ['ovServices', 'services_active', '/admin/prices']] as const).map(([k, c, href]) => (
            <Link key={k} href={href} className="rounded-2xl border p-5 transition-colors hover:bg-surface">
              <p className="text-sm text-muted">{t(k)}</p>
              <p className="mt-2 text-3xl font-semibold" dir="ltr">{diag.counts[c]}</p>
            </Link>
          ))}
        </section>
      )}

      {total > 0 && (
        <section>
          <p className="mb-2 text-sm text-muted">{t('aDist')}</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-surface">
            {order.map((k) => d[k] > 0 && <div key={k} className={BAR[k]} style={{ width: `${(d[k] / total) * 100}%` }} title={`${t(`st_${k}`)}: ${d[k]}`} />)}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t('aRecent')}</h2>
            <Link href="/admin/doctors" className="text-sm text-cyan-accent">{t('aViewAll')}</Link>
          </div>
          {s.recent.length === 0 && <p className="text-sm text-muted">{t('aNone')}</p>}
          <ul className="divide-y">
            {s.recent.map((r) => (
              <li key={r.user_id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{r.profiles?.full_name ?? t('aNoName')}</p>
                  <p className="truncate text-muted" dir="ltr">{r.profiles?.email}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-0.5 text-xs ${TONE[r.status]}`}>{t(`st_${r.status}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border p-5">
          <h2 className="mb-3 font-semibold">{t('aActivity')}</h2>
          {s.activity.length === 0 && <p className="text-sm text-muted">{t('aNone')}</p>}
          <ul className="divide-y">
            {s.activity.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <p>{t('actStatus')} <b>{a.details?.to ? t(`st_${a.details.to}`) : ''}</b></p>
                <p className="text-xs text-muted">{when(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
