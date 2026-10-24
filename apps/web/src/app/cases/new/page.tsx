'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Svc = { id: string; name_ar: string; name_en: string; price: number };

export default function NewCase() {
  const router = useRouter();
  const { t, lang } = usePrefs();
  const [svcs, setSvcs] = useState<Svc[] | null>(null);
  const [approved, setApproved] = useState(true);
  const [f, setF] = useState({ service_id: '', patient_ref: '', tooth_numbers: '', material: '', shade: '', instructions: '' });
  const [qty, setQty] = useState('1');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID()); // same key on retry => never two cases for one click

  useEffect(() => {
    api<{ services: Svc[] }>('/lab-services').then((x) => { setSvcs(x.services); setF((p) => ({ ...p, service_id: x.services[0]?.id ?? '' })); }).catch((e) => setErr(e.message));
    api<{ status: string }>('/doctors/me').then((d) => setApproved(d.status === 'approved')).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, !v.trim() ? undefined : v]));
    try { const c = await api<{ id: string }>('/lab-cases', { method: 'POST', body: JSON.stringify({ ...body, quantity: Number(qty) || 1, idempotency_key: key.current }) }); let failed = false;
      for (const file of files) { try { const fd = new FormData(); fd.append('file', file); await api(`/lab-cases/${c.id}/files`, { method: 'POST', body: fd }); } catch { failed = true; } }
      router.replace(`/cases/${c.id}${failed ? '?f=failed' : ''}`); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  const inp = 'w-full rounded-xl border px-3 py-2.5 text-sm';
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (!svcs) return <main className="mx-auto max-w-2xl p-6">{err ? <p className="text-red-500">{err}</p> : <div className="h-64 animate-pulse rounded-2xl bg-surface" />}</main>;
  const price = svcs.find((s) => s.id === f.service_id)?.price ?? 0;
  const n = Math.min(100, Math.max(1, Number(qty) || 1));

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      <Link href="/cases" className="text-sm text-cyan-accent">← {t('csTitle')}</Link>
      <h1 className="text-3xl font-semibold">{t('csNew')}</h1>
      {!approved && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t('ckNotApproved')}</p>}
      {svcs.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-muted">{t('csNoService')}</p>}
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">{t('csService')}
          <select required className={inp} value={f.service_id} onChange={set('service_id')}>{svcs.map((s) => <option key={s.id} value={s.id}>{lang === 'ar' ? s.name_ar : s.name_en} — {money(s.price, lang)}</option>)}</select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">{t('csQty')}<input required type="number" min={1} max={100} dir="ltr" className={inp} value={qty} onChange={(e) => setQty(e.target.value)} /><span className="text-xs text-muted">{t('csQtyHint')}</span></label>
          <div className="rounded-xl bg-surface p-3 text-sm">
            <p className="text-muted">{t('csTotal')}</p>
            <p className="text-2xl font-semibold" dir="ltr">{money(price * n, lang)}</p>
            <p className="text-xs text-muted">{t('csOnAccount')}</p>
          </div>
        </div>
        <label className="block text-sm">{t('csPatient')}<input required maxLength={60} dir="ltr" className={inp} value={f.patient_ref} onChange={set('patient_ref')} /><span className="text-xs text-muted">{t('csPatientHint')}</span></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">{t('csTeeth')}<input pattern="[0-9,\-\s]{1,100}" dir="ltr" className={inp} value={f.tooth_numbers} onChange={set('tooth_numbers')} /></label>
          <label className="text-sm">{t('csMaterial')}<input maxLength={100} className={inp} value={f.material} onChange={set('material')} /></label>
          <label className="text-sm">{t('csShade')}<input maxLength={30} dir="ltr" className={inp} value={f.shade} onChange={set('shade')} /></label>
        </div>
        <label className="block text-sm">{t('fiAttach')}<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.zip,.stl,.ply" className="mt-1 block" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} /><span className="text-xs text-muted">{t('fiHint')}</span></label>
        <label className="block text-sm">{t('csInstr')}<textarea rows={4} maxLength={2000} className={inp} value={f.instructions} onChange={set('instructions')} /></label>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <button disabled={busy || !approved || svcs.length === 0} className="w-full rounded-xl bg-navy-900 py-3 font-medium text-white disabled:opacity-40">{busy ? '…' : t('csSubmit')}</button>
      </form>
    </main>
  );
}
