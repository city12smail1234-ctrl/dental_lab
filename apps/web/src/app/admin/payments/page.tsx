'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';

type P = { id: string; doctor_id: string; amount: number; method: string; reference: string; status: string; reject_reason: string | null; created_at: string; proof_url: string | null; profiles: { full_name: string | null; email: string | null; phone: string | null } | null };
const TONE: Record<string, string> = { pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', rejected: 'bg-red-500/15 text-red-700 dark:text-red-300' };

export default function Payments() {
  const { t, lang } = usePrefs();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [list, setList] = useState<P[] | null>(null);
  const [err, setErr] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api<P[]>(`/admin/dues?status=${tab}`).then((x) => { setList(x); setErr(''); }).catch((e) => setErr(e.message)), [tab]);
  useEffect(() => { load(); }, [load]);
  usePolling(load);

  async function act(p: P, kind: 'confirm' | 'reject') {
    if (kind === 'confirm' && !confirm(`${t('dqConfirmAsk')} ${money(p.amount, lang)}`)) return;
    setBusy(p.id); setErr('');
    try { await api(`/admin/dues/${p.id}/${kind}`, { method: 'POST', body: JSON.stringify(kind === 'reject' ? { reason: reason[p.id] || undefined } : {}) }); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  }
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm ${on ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('dqTitle')}</h1>
      <div className="flex gap-2"><button className={chip(tab === 'pending')} onClick={() => setTab('pending')}>{t('dqPending')}</button><button className={chip(tab === 'all')} onClick={() => setTab('all')}>{t('svAll')}</button></div>
      {err && <p role="alert" className="text-red-500">{err}</p>}
      {!list && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {list?.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('dqNone')}</p>}
      <ul className="space-y-3">
        {list?.map((p) => (
          <li key={p.id} className="space-y-3 rounded-2xl border p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold" dir="ltr">{money(p.amount, lang)}</p>
                <p><Link href={`/admin/accounts/${p.doctor_id}`} className="font-medium text-cyan-accent">{p.profiles?.full_name ?? t('aNoName')}</Link> <span className="text-muted" dir="ltr">{p.profiles?.phone}</span></p>
                <p className="text-muted">{t(`pm_${p.method}`)} · <span dir="ltr">{p.reference}</span> · {when(p.created_at)}</p>
              </div>
              <span className={`rounded-full px-3 py-0.5 text-xs ${TONE[p.status]}`}>{t(`dp_${p.status}`)}</span>
            </div>
            {p.proof_url && <a href={p.proof_url} target="_blank" rel="noopener noreferrer" className="inline-block text-cyan-accent underline">{t('dqProof')}</a>}
            {p.status === 'rejected' && p.reject_reason && <p className="text-red-500">{t('payDReason')}: {p.reject_reason}</p>}
            {p.status === 'pending' && (
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={busy === p.id} onClick={() => act(p, 'confirm')} className="rounded-lg bg-navy-900 px-4 py-2 font-medium text-white disabled:opacity-40">{t('dqConfirm')}</button>
                <input value={reason[p.id] ?? ''} onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })} maxLength={200} placeholder={t('dqReason')} className="min-w-0 flex-1 rounded-lg border px-3 py-2" />
                <button disabled={busy === p.id} onClick={() => act(p, 'reject')} className="rounded-lg border px-4 py-2 text-red-500 hover:bg-surface disabled:opacity-40">{t('dqReject')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
