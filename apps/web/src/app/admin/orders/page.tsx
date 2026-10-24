'use client';
import { usePolling } from '@/lib/poll';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PayBadge, StatusBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { Countdown, isOpenStatus } from '@/components/Countdown';
import { itemsSummary } from '@/lib/summary';
import { usePrefs } from '@/lib/prefs';

type O = { id: string; order_number: string; status: string; payment_method: string; payment_status: string; total: number; created_at: string; due_at: string | null; order_items: { name_ar: string; name_en: string; quantity: number }[]; doctor: { full_name: string | null; clinic_name: string | null; phone: string | null } | null };
const TABS = ['', 'pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];

export default function AdminOrders() {
  const { t, lang } = usePrefs();
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<{ items: O[]; total: number; limit: number } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setRes(await api(`/admin/orders?status=${tab}&search=${encodeURIComponent(q)}&page=${page}`)); setErr(''); } catch (e) { setErr((e as Error).message); }
  }, [tab, q, page]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  usePolling(load);

  const pages = res ? Math.max(1, Math.ceil(res.total / res.limit)) : 1;
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('aOrders')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((k) => <button key={k} onClick={() => { setTab(k); setPage(1); }} className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`}>{k ? t(`os_${k}`) : t('svAll')}</button>)}
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('aoSearch')} dir="ltr" className="ms-auto w-full rounded-full border px-4 py-1.5 text-sm sm:w-56" />
      </div>
      {err && <p className="text-red-500">{err}</p>}
      {!res && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {res?.items.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('orNone')}</p>}
      <ul className="space-y-3">
        {res?.items.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-surface">
              <div className="text-sm">
                <p className="font-semibold">{o.doctor?.full_name ?? '—'}{o.doctor?.clinic_name && <span className="font-normal text-muted"> — {o.doctor.clinic_name}</span>}</p>
                <p>{itemsSummary(o.order_items, lang)}</p>
                <p className="text-muted"><span dir="ltr">{o.order_number}</span> · {when(o.created_at)} · {t(`pm_${o.payment_method}`)}</p>
                {o.due_at && isOpenStatus(o.status) && <div className="mt-1"><Countdown due={o.due_at} /></div>}
              </div>
              <div className="flex items-center gap-2"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /><b dir="ltr">{money(o.total, lang)}</b></div>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t('prPrev')}</button>
          <span dir="ltr">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t('prNext')}</button>
        </div>
      )}
    </div>
  );
}
