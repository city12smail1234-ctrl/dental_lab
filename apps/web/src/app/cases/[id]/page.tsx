'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CaseBadge } from '@/components/Badges';
import { CaseFiles, CaseFile } from '@/components/CaseFiles';
import { DeliveryCard } from '@/components/DeliveryCard';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePolling } from '@/lib/poll';
import { Countdown } from '@/components/Countdown';
import { usePrefs } from '@/lib/prefs';

type Case = {
  id: string; case_number: string; service_name_ar: string; service_name_en: string; patient_ref: string; tooth_numbers: string | null; material: string | null; shade: string | null; instructions: string | null;
  quantity: number; unit_price: number | null; total: number | null;
  status: string; estimated_completion: string | null; due_at: string | null; submitted_at: string; updated_at: string;
  history: { id: number; to_status: string; note: string | null; created_at: string }[];
  messages: { id: string; author_role: string; body: string; created_at: string }[];
  files: CaseFile[];
};
const PIPE = ['submitted', 'approved', 'designing', 'milling', 'finishing', 'quality_control', 'ready_for_delivery', 'out_for_delivery', 'delivered'];

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const [c, setC] = useState<Case | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Case>(`/lab-cases/${id}`).then(setC).catch(() => setC(null)), [id]);
  const [failed, setFailed] = useState(false);
  useEffect(() => { load(); setFailed(new URLSearchParams(location.search).get('f') === 'failed'); }, [load]);
  usePolling(load);

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { setC(await api<Case>(`/lab-cases/${id}/messages`, { method: 'POST', body: JSON.stringify({ body: msg }) })); setMsg(''); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  async function cancel() {
    if (!confirm(t('csConfirmCancel'))) return;
    try { setC(await api<Case>(`/lab-cases/${id}/cancel`, { method: 'POST' })); } catch (x) { setErr((x as Error).message); }
  }

  if (c === undefined) return <main className="mx-auto max-w-3xl p-6"><div className="h-64 animate-pulse rounded-2xl bg-surface" /></main>;
  if (c === null) return <p className="p-10 text-center text-muted">{t('stNotFound')}</p>;

  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const day = (x: string) => new Date(x).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });
  const i = PIPE.indexOf(c.status);
  const next = i >= 0 && i < PIPE.length - 1 ? PIPE[i + 1] : null;
  const open = !['delivered', 'rejected', 'cancelled'].includes(c.status);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Link href="/cases" className="text-sm text-cyan-accent">← {t('csTitle')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold" dir="ltr">{c.case_number}</h1><CaseBadge s={c.status} /></div>
      {err && <p role="alert" className="text-red-500">{err}</p>}
      {c.status === 'info_required' && <p className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 text-sm">{t('csNeedInfo')}</p>}

      <section className="grid gap-3 rounded-2xl border p-5 text-sm sm:grid-cols-2">
        <p><span className="text-muted">{t('csCurrent')}: </span><b>{t(`cs_${c.status}`)}</b></p>
        <p><span className="text-muted">{t('csUpdated')}: </span>{when(c.updated_at)}</p>
        <p><span className="text-muted">{t('csNext')}: </span>{next && open ? t(`cs_${next}`) : '—'}</p>
        <p className="flex flex-wrap items-center gap-2"><span className="text-muted">{t('csEta')}: </span>{c.due_at && open ? <Countdown due={c.due_at} /> : c.estimated_completion ? day(c.estimated_completion) : t('csEtaNone')}</p>
      </section>

      <section className="space-y-1 rounded-2xl border p-5 text-sm">
        <h2 className="mb-2 font-medium">{t('csSpecs')}</h2>
        <p>{lang === 'ar' ? c.service_name_ar : c.service_name_en} · <span dir="ltr">{c.patient_ref}</span></p>
        {c.total != null && <p>{t('csQty')}: {c.quantity} × <span dir="ltr">{money(c.unit_price ?? 0, lang)}</span> = <b dir="ltr">{money(c.total, lang)}</b></p>}
        {c.tooth_numbers && <p>{t('csTeeth').split(' (')[0]}: <span dir="ltr">{c.tooth_numbers}</span></p>}
        {c.material && <p>{t('csMaterial')}: {c.material}</p>}
        {c.shade && <p>{t('csShade')}: <span dir="ltr">{c.shade}</span></p>}
        {c.instructions && <p className="whitespace-pre-wrap text-muted">{c.instructions}</p>}
      </section>

      <DeliveryCard caseId={c.id} />

      <CaseFiles base="/lab-cases" caseId={c.id} files={c.files} notice={failed} canUpload={open} canDelete={(f) => ['submitted', 'info_required'].includes(c.status) && f.uploader_role === 'doctor'} onChange={setC as never} />

      <section className="rounded-2xl border p-5">
        <h2 className="mb-3 font-medium">{t('csTimeline')}</h2>
        <ol className="space-y-3 text-sm">
          {[...c.history].reverse().map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2"><CaseBadge s={h.to_status} /><span className="text-muted">{when(h.created_at)}</span>{h.note && <span>— {h.note}</span>}</li>
          ))}
        </ol>
      </section>

      <section className="space-y-3 rounded-2xl border p-5">
        <h2 className="font-medium">{t('csMessages')}</h2>
        <ul className="space-y-2 text-sm">
          {c.messages.map((m) => (
            <li key={m.id} className={`rounded-xl p-3 ${m.author_role === 'doctor' ? 'bg-surface' : 'border'}`}>
              <p className="text-xs text-muted">{m.author_role === 'doctor' ? t('csYou') : t('csLab')} · {when(m.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
        {open && (
          <form onSubmit={send} className="space-y-2">
            <textarea required rows={3} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('csReply')} className="w-full rounded-xl border px-3 py-2 text-sm" />
            <button disabled={busy} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? '…' : t('csSend')}</button>
          </form>
        )}
      </section>

      {['submitted', 'info_required'].includes(c.status) && <button onClick={cancel} className="rounded-xl border border-red-500/50 px-5 py-2 text-sm text-red-500">{t('csCancel')}</button>}
    </main>
  );
}
