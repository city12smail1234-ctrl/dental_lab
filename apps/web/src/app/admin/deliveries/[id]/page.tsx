'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DeliveryBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type D = {
  id: string; reference: string; status: string; phone: string; address: string; instructions: string | null; fee: number; assigned_to: string | null; scheduled_for: string | null; delivered_at: string | null; received_by: string | null; delivery_notes: string | null;
  order_id: string | null; case_id: string | null;
  history: { id: number; to_status: string; note: string | null; created_at: string }[];
  doctor: { full_name: string | null; email: string | null; phone: string | null; clinic_name?: string | null } | null;
  order: { order_number: string; total: number; payment_method: string; payment_status: string } | null; case: { case_number: string } | null;
  courier: { full_name: string | null; email: string | null } | null;
};
type Person = { id: string; full_name: string | null; email: string | null };
const NEXT: Record<string, string[]> = {
  awaiting_confirmation: ['confirmed', 'cancelled'], confirmed: ['preparing', 'ready_for_dispatch', 'cancelled'], preparing: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['out_for_delivery', 'cancelled'], out_for_delivery: ['delivered', 'failed'], failed: ['rescheduled', 'out_for_delivery', 'cancelled'],
  rescheduled: ['ready_for_dispatch', 'out_for_delivery', 'cancelled'], delivered: [], cancelled: [],
};

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const [d, setD] = useState<D | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [manager, setManager] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [by, setBy] = useState('');
  const [assign, setAssign] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const apply = (x: D) => { setD(x); setAssign(x.assigned_to ?? ''); setDate(x.scheduled_for ?? ''); setNotes(x.delivery_notes ?? ''); };
  useEffect(() => {
    api<D>(`/admin/deliveries/${id}`).then(apply).catch((e) => setErr(e.message));
    api<Person[]>('/admin/deliveries/couriers').then(setPeople).catch(() => {});
    api<{ roles: string[] }>('/auth/me').then((m) => setManager(['super_admin', 'lab_manager', 'delivery_coordinator'].some((r) => m.roles.includes(r)))).catch(() => {});
  }, [id]);

  async function call(path: string, method: string, body: object, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return false;
    setErr('');
    try { apply(await api<D>(`/admin/deliveries/${id}${path}`, { method, body: JSON.stringify(body) })); return true; } catch (e) { setErr((e as Error).message); return false; }
  }

  if (err && !d) return <p className="text-red-500">{err}</p>;
  if (!d) return <div className="h-64 animate-pulse rounded-2xl bg-surface" />;
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const btn = 'rounded-lg border px-3 py-1.5 text-sm hover:bg-surface';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/deliveries" className="text-sm text-cyan-accent">← {t('aDeliveries')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold" dir="ltr">{d.reference}</h1><DeliveryBadge s={d.status} /></div>
      <p className="text-lg font-semibold">{d.doctor?.full_name ?? '—'}{d.doctor?.clinic_name && <span className="font-normal text-muted"> — {d.doctor.clinic_name}</span>}</p>
      {err && <p role="alert" className="text-red-500">{err}</p>}

      <section className="space-y-1 rounded-2xl border p-4 text-sm">
        <p><b>{t('aoCustomer')}:</b> {d.doctor?.full_name ?? '—'} <span className="text-muted" dir="ltr">{d.doctor?.email}</span></p>
        <p dir="ltr" className="text-start"><b>{t('ckPhone')}:</b> {d.phone || d.doctor?.phone || '—'}</p>
        <p><b>{t('orAddr')}:</b> {d.address || '—'}</p>
        {d.instructions && <p><b>{t('ckInstr')}:</b> {d.instructions}</p>}
        {d.order && <p><b>{t('dvOrder')}:</b> <Link className="text-cyan-accent" dir="ltr" href={`/admin/orders/${d.order_id}`}>{d.order.order_number}</Link> · {t(`pm_${d.order.payment_method}`)} · {t(`ps_${d.order.payment_status}`)} · <span dir="ltr">{money(d.order.total, lang)}</span></p>}
        {d.case && <p><b>{t('dvCase')}:</b> <Link className="text-cyan-accent" dir="ltr" href={`/admin/cases/${d.case_id}`}>{d.case.case_number}</Link></p>}
        <p><b>{t('dvFee')}:</b> <span dir="ltr">{money(d.fee, lang)}</span></p>
        {d.delivered_at && <p><b>{t('dvDeliveredAt')}:</b> {when(d.delivered_at)} {d.received_by ? `· ${t('dvReceived')}: ${d.received_by}` : ''}</p>}
      </section>

      {NEXT[d.status].length > 0 && (
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="font-medium">{t('dvUpdate')}</h2>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('aoNote')} className={f} />
          {d.status === 'out_for_delivery' && <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={100} placeholder={t('dvReceivedHint')} className={f} />}
          <div className="flex flex-wrap gap-2">
            {NEXT[d.status].map((s) => (
              <button key={s} className={`${btn} ${['cancelled', 'failed'].includes(s) ? 'text-red-500' : ''}`} onClick={async () => { if (await call('/status', 'POST', { status: s, note: note || undefined, received_by: s === 'delivered' ? by : undefined }, t('aSure'))) { setNote(''); setBy(''); } }}>{t(`dv_${s}`)}</button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border p-4">
        <label className="block text-sm">{t('dvAssign')}
          <select disabled={!manager} className={f} value={assign} onChange={(e) => setAssign(e.target.value)}><option value="">{t('dvNobody')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}</select>
        </label>
        <label className="block text-sm">{t('dvDate')}<input disabled={!manager} type="date" dir="ltr" className={f} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block text-sm">{t('dvNotes')}<textarea disabled={!manager} rows={2} maxLength={500} className={f} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {manager ? <button className={btn} onClick={() => call('', 'PATCH', { assigned_to: assign || null, scheduled_for: date || null, delivery_notes: notes || null })}>{t('dvSave')}</button> : <p className="text-xs text-muted">{t('dvManagersOnly')}</p>}
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-medium">{t('orHistory')}</h2>
        <ul className="space-y-2 text-sm">{[...d.history].reverse().map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2"><DeliveryBadge s={h.to_status} /><span className="text-muted">{when(h.created_at)}</span>{h.note && <span>— {h.note}</span>}</li>)}</ul>
      </section>
    </div>
  );
}
