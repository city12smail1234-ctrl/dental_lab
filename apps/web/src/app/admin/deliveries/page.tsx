'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DeliveryBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';

type D = { id: string; reference: string; status: string; address: string; assigned_to: string | null; scheduled_for: string | null; created_at: string; order_id: string | null; case_id: string | null; doctor: { full_name: string | null; clinic_name: string | null; phone: string | null } | null };
const STATUSES = ['awaiting_confirmation', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'failed', 'rescheduled', 'cancelled'];

export default function Deliveries() {
  const { t, lang } = usePrefs();
  const [res, setRes] = useState<{ items: D[]; total: number; limit: number } | null>(null);
  const [st, setSt] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setRes(await api(`/admin/deliveries?status=${st}&search=${encodeURIComponent(q)}&page=${page}`)); setErr(''); } catch (e) { setErr((e as Error).message); }
  }, [st, q, page]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  usePolling(load);
  const pages = res ? Math.max(1, Math.ceil(res.total / res.limit)) : 1;
  const day = (x: string) => new Date(x).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('aDeliveries')}</h1>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('dvSearch')} dir="ltr" className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm" />
        <select value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }} className="rounded-full border bg-surface px-4 py-2 text-sm">
          <option value="">{t('svAll')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`dv_${s}`)}</option>)}
        </select>
      </div>
      {err && <p className="text-red-500">{err}</p>}
      {!res && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {res?.items.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('dvNone')}</p>}
      <ul className="space-y-3">
        {res?.items.map((d) => (
          <li key={d.id}>
            <Link href={`/admin/deliveries/${d.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-surface">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{d.doctor?.full_name ?? '—'}{d.doctor?.clinic_name && <span className="font-normal text-muted"> — {d.doctor.clinic_name}</span>}</p>
                <p className="truncate text-muted"><span dir="ltr">{d.reference}</span> · {d.order_id ? t('dvOrder') : t('dvCase')} · {d.address || '—'}</p>
                <p className="text-muted">{day(d.created_at)}{d.scheduled_for ? ` · ${t('dvDate')}: ${day(d.scheduled_for)}` : ''}{!d.assigned_to ? ` · ${t('dvNobody')}` : ''}</p>
              </div>
              <DeliveryBadge s={d.status} />
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
