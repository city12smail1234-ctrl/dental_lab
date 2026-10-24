'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type A = { id: number; actor: string | null; target: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string };
const ENTITIES = ['doctor_profiles', 'orders', 'lab_cases', 'lab_services', 'products', 'deliveries', 'doctor_account', 'app_settings', 'staff'];

export default function Audit() {
  const { t, lang } = usePrefs();
  const [res, setRes] = useState<{ items: A[]; total: number; limit: number } | null>(null);
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');

  const load = useCallback(() => api(`/admin/audit?page=${page}&entity=${entity}`).then((x) => { setRes(x as never); setErr(''); }).catch((e) => setErr(e.message)), [page, entity]);
  useEffect(() => { load(); }, [load]);
  const pages = res ? Math.max(1, Math.ceil(res.total / res.limit)) : 1;
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('auTitle')}</h1>
      <select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="rounded-full border bg-surface px-4 py-2 text-sm" aria-label={t('auEntity')}>
        <option value="">{t('auAll')}</option>{ENTITIES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      {err && <p className="text-red-500">{err}</p>}
      {!res && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {res?.items.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('aNone')}</p>}
      <ul className="divide-y rounded-2xl border">
        {res?.items.map((a) => (
          <li key={a.id} className="space-y-1 p-4 text-sm">
            <p className="font-semibold">{a.target || (a.entity_id ? a.entity_id.slice(0, 8) : a.entity)}</p>
            <p className="text-muted"><span dir="ltr">{a.action}</span> · {t('auActor')}: {a.actor ?? t('auSystem')} · {when(a.created_at)}</p>
            {Object.keys(a.details ?? {}).length > 0 && <p className="break-all text-xs text-muted" dir="ltr">{JSON.stringify(a.details)}</p>}
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
