'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CaseBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/poll';
import { Countdown, isOpenStatus } from '@/components/Countdown';
import { usePrefs } from '@/lib/prefs';

type C = { id: string; case_number: string; service_name_ar: string; service_name_en: string; patient_ref: string; quantity: number; due_at: string | null; status: string; assigned_to: string | null; submitted_at: string; doctor: { full_name: string | null; clinic_name: string | null } | null };
const STATUSES = ['submitted', 'info_required', 'approved', 'designing', 'milling', 'finishing', 'quality_control', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'on_hold', 'rejected', 'cancelled'];

export default function AdminCases() {
  const { t, lang } = usePrefs();
  const [res, setRes] = useState<{ items: C[]; total: number; limit: number } | null>(null);
  const [st, setSt] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setRes(await api(`/admin/lab-cases?status=${st}&search=${encodeURIComponent(q)}&page=${page}`)); setErr(''); } catch (e) { setErr((e as Error).message); }
  }, [st, q, page]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  usePolling(load);

  const pages = res ? Math.max(1, Math.ceil(res.total / res.limit)) : 1;
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('aCases')}</h1>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('acSearch')} className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm" />
        <select value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }} className="rounded-full border bg-surface px-4 py-2 text-sm">
          <option value="">{t('svAll')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`cs_${s}`)}</option>)}
        </select>
      </div>
      {err && <p className="text-red-500">{err}</p>}
      {!res && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {res?.items.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('csNone')}</p>}
      <ul className="space-y-3">
        {res?.items.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-surface">
              <div className="text-sm">
                <p className="font-semibold">{c.doctor?.full_name ?? '—'}{c.doctor?.clinic_name && <span className="font-normal text-muted"> — {c.doctor.clinic_name}</span>}</p>
                <p>{lang === 'ar' ? c.service_name_ar : c.service_name_en}{c.quantity > 1 && <span dir="ltr"> ×{c.quantity}</span>}</p>
                <p className="text-muted"><span dir="ltr">{c.case_number}</span> · <span dir="auto">{c.patient_ref}</span></p>
                {c.due_at && isOpenStatus(c.status) && <div className="mt-1"><Countdown due={c.due_at} /></div>}
                <p className="text-muted">{when(c.submitted_at)}</p>
              </div>
              <CaseBadge s={c.status} />
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
