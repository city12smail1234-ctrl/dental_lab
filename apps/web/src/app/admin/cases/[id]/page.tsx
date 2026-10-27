'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CaseBadge } from '@/components/Badges';
import { CaseFiles, CaseFile } from '@/components/CaseFiles';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { DueControl } from '@/components/DueControl';
import { usePrefs } from '@/lib/prefs';

type Case = {
  id: string; case_number: string; service_name_ar: string; service_name_en: string; patient_ref: string; tooth_numbers: string | null; material: string | null; shade: string | null; instructions: string | null;
  quantity: number; unit_price: number | null; total: number | null;
  status: string; assigned_to: string | null; estimated_completion: string | null; due_at: string | null; submitted_at: string;
  doctor: { full_name?: string; email?: string; phone?: string; clinic_name?: string; clinic_address?: string };
  history: { id: number; to_status: string; note: string | null; created_at: string }[];
  notes: { id: string; author_role: string; visibility: string; body: string; created_at: string }[];
  files: CaseFile[];
};
type Tech = { id: string; full_name: string | null; email: string | null };

// Mirrors the server-side workflow (the server is the one that enforces it).
function allowed(cur: string): string[] {
  const prod = ['designing', 'milling', 'finishing', 'quality_control'];
  switch (cur) {
    case 'submitted': return ['info_required', 'approved', 'rejected', 'on_hold', 'cancelled'];
    case 'info_required': return ['approved', 'rejected', 'cancelled'];
    case 'approved': return [...prod, 'on_hold', 'cancelled'];
    case 'designing': case 'milling': return [...prod.filter((s) => s !== cur), 'on_hold', 'cancelled'];
    case 'finishing': case 'quality_control': return [...prod.filter((s) => s !== cur), 'ready_for_delivery', 'on_hold', 'cancelled'];
    case 'on_hold': return ['approved', ...prod, 'ready_for_delivery', 'cancelled'];
    case 'ready_for_delivery': return ['out_for_delivery', 'on_hold', 'cancelled'];
    case 'out_for_delivery': return ['delivered', 'cancelled'];
    default: return [];
  }
}

export default function AdminCase() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const [c, setC] = useState<Case | null>(null);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [manager, setManager] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [assign, setAssign] = useState('');
  const [eta, setEta] = useState('');
  const [nb, setNb] = useState({ visibility: 'internal', body: '' });

  const apply = (x: Case) => { setC(x); setAssign(x.assigned_to ?? ''); setEta(x.estimated_completion ?? ''); };
  useEffect(() => {
    api<Case>(`/admin/lab-cases/${id}`).then(apply).catch((e) => setErr(e.message));
    api<Tech[]>('/admin/lab-cases/technicians').then(setTechs).catch(() => {});
    api<{ roles: string[] }>('/auth/me').then((m) => setManager(m.roles.includes('lab_manager') || m.roles.includes('super_admin'))).catch(() => {});
  }, [id]);

  async function call(path: string, method: string, body: object, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setErr('');
    try { apply(await api<Case>(`/admin/lab-cases/${id}${path}`, { method, body: JSON.stringify(body) })); return true; } catch (e) { setErr((e as Error).message); }
  }

  if (err && !c) return <p className="text-red-500">{err}</p>;
  if (!c) return <div className="h-64 animate-pulse rounded-2xl bg-surface" />;
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const btn = 'rounded-lg border px-3 py-1.5 text-sm hover:bg-surface';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/cases" className="text-sm text-cyan-accent">← {t('aCases')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold" dir="ltr">{c.case_number}</h1><CaseBadge s={c.status} /></div>
      <p className="text-lg font-semibold">{c.doctor.full_name ?? '—'}{c.doctor.clinic_name && <span className="font-normal text-muted"> — {c.doctor.clinic_name}</span>}</p>
      {err && <p role="alert" className="text-red-500">{err}</p>}

      <section className="space-y-1 rounded-2xl border p-4 text-sm">
        <p><b>{t('aoCustomer')}:</b> {c.doctor.full_name ?? '—'} <span className="text-muted" dir="ltr">{c.doctor.email} · {c.doctor.phone}</span></p>
        <p><b>{t('acClinic')}:</b> {c.doctor.clinic_name ?? '—'} {c.doctor.clinic_address ? `— ${c.doctor.clinic_address}` : ''}</p>
        <p><b>{t('csService')}:</b> {lang === 'ar' ? c.service_name_ar : c.service_name_en} · <span dir="auto">{c.patient_ref}</span></p>
        {c.total != null && <p><b>{t('csTotal')}:</b> {c.quantity} × <span dir="ltr">{money(c.unit_price ?? 0, lang)}</span> = <b dir="ltr">{money(c.total, lang)}</b></p>}
        {c.tooth_numbers && <p><b>{t('csTeeth').split(' (')[0]}:</b> <span dir="ltr">{c.tooth_numbers}</span></p>}
        {c.material && <p><b>{t('csMaterial')}:</b> {c.material}</p>}
        {c.shade && <p><b>{t('csShade')}:</b> <span dir="ltr">{c.shade}</span></p>}
        {c.instructions && <p className="whitespace-pre-wrap text-muted">{c.instructions}</p>}
        <p className="text-muted">{when(c.submitted_at)}</p>
      </section>

      {allowed(c.status).length > 0 && (
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="font-medium">{t('acStatus')}</h2>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('aoNote')} className={f} />
          <p className="text-xs text-muted">{t('acStatusWarn')}</p>
          <div className="flex flex-wrap gap-2">
            {allowed(c.status).map((s) => <button key={s} className={`${btn} ${['cancelled', 'rejected'].includes(s) ? 'text-red-500' : ''}`} onClick={async () => { if (await call('/status', 'POST', { status: s, note: note || undefined }, t('aSure'))) setNote(''); }}>{t(`cs_${s}`)}</button>)}
          </div>
        </section>
      )}

      {!['delivered', 'rejected', 'cancelled'].includes(c.status) && <DueControl due={c.due_at} canEdit={manager} onSet={(h) => call('', 'PATCH', { due_in_hours: h })} />}

      <section className="space-y-3 rounded-2xl border p-4">
        <label className="block text-sm">{t('acAssign')}
          <select disabled={!manager} className={f} value={assign} onChange={(e) => setAssign(e.target.value)}>
            <option value="">{t('acNobody')}</option>{techs.map((x) => <option key={x.id} value={x.id}>{x.full_name ?? x.email}</option>)}
          </select>
        </label>
        {manager ? <button className={btn} onClick={() => call('', 'PATCH', { assigned_to: assign || null })}>{t('acSaveAssign')}</button> : <p className="text-xs text-muted">{t('acManagersOnly')}</p>}
      </section>

      <CaseFiles base="/admin/lab-cases" caseId={c.id} files={c.files} canUpload={!['delivered', 'rejected', 'cancelled'].includes(c.status)} canDelete={() => true} onChange={apply as never} />

      <section className="space-y-3 rounded-2xl border p-4">
        <h2 className="font-medium">{t('acNotes')}</h2>
        <ul className="space-y-2 text-sm">
          {c.notes.map((n) => (
            <li key={n.id} className={`rounded-xl p-3 ${n.visibility === 'internal' ? 'border border-dashed' : 'bg-surface'}`}>
              <p className="text-xs text-muted">{n.visibility === 'internal' ? t('acInternal') : t('acVisible')} · {n.author_role === 'doctor' ? t('aoCustomer') : t('csLab')} · {when(n.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
        <select value={nb.visibility} onChange={(e) => setNb({ ...nb, visibility: e.target.value })} className={f}>
          <option value="internal">{t('acInternal')}</option><option value="doctor">{t('acVisible')}</option>
        </select>
        <textarea rows={3} maxLength={2000} value={nb.body} onChange={(e) => setNb({ ...nb, body: e.target.value })} className={f} />
        <button disabled={!nb.body.trim()} className={`${btn} disabled:opacity-40`} onClick={async () => { if (await call('/notes', 'POST', nb)) setNb({ ...nb, body: '' }); }}>{t('acAddNote')}</button>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-medium">{t('csTimeline')}</h2>
        <ul className="space-y-2 text-sm">{[...c.history].reverse().map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2"><CaseBadge s={h.to_status} /><span className="text-muted">{when(h.created_at)}</span>{h.note && <span>— {h.note}</span>}</li>)}</ul>
      </section>
    </div>
  );
}
