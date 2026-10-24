'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CaseBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/poll';
import { Countdown, isOpenStatus } from '@/components/Countdown';
import { usePrefs } from '@/lib/prefs';

type C = { id: string; case_number: string; service_name_ar: string; service_name_en: string; patient_ref: string; status: string; estimated_completion: string | null; due_at: string | null; quantity: number; submitted_at: string; updated_at: string };
const STATUSES = ['submitted', 'info_required', 'approved', 'designing', 'milling', 'finishing', 'quality_control', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'on_hold', 'rejected', 'cancelled'];

export default function Cases() {
  const { t, lang } = usePrefs();
  const [list, setList] = useState<C[] | null>(null);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setList(await api(`/lab-cases?status=${st}&search=${encodeURIComponent(q)}`)); setErr(''); } catch (e) { setErr((e as Error).message); }
  }, [q, st]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  usePolling(load);
  const date = (x: string) => new Date(x).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t('csTitle')}</h1>
        <Link href="/cases/new" className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('csNew')}</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('csSearch')} className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm" />
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label={t('orStatus')} className="rounded-full border bg-surface px-4 py-2 text-sm">
          <option value="">{t('svAll')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`cs_${s}`)}</option>)}
        </select>
      </div>
      {err && <p className="text-red-500">{err}</p>}
      {!list && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {list?.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('csNone')}</p>}
      <ul className="space-y-3">
        {list?.map((c) => (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-surface">
              <div className="text-sm">
                <p className="font-semibold">{lang === 'ar' ? c.service_name_ar : c.service_name_en}{c.quantity > 1 && <span dir="ltr"> ×{c.quantity}</span>}</p>
                <p className="text-muted"><span dir="ltr">{c.case_number}</span> · <span dir="ltr">{c.patient_ref}</span> · {date(c.submitted_at)}</p>
                {c.due_at && isOpenStatus(c.status) ? <div className="mt-1"><Countdown due={c.due_at} /></div> : c.estimated_completion && <p className="text-muted">{t('csEta')}: {date(c.estimated_completion)}</p>}
              </div>
              <CaseBadge s={c.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
