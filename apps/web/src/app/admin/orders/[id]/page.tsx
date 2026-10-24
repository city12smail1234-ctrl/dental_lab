'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PayBadge, StatusBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { DueControl } from '@/components/DueControl';
import { usePrefs } from '@/lib/prefs';

type Pay = { id: string; status: string; method: string; reference: string | null; amount: number; proof_url: string | null; created_at: string };
type Order = {
  id: string; order_number: string; status: string; payment_method: string; payment_status: string; subtotal: number; delivery_fee: number; total: number; phone: string; address: string; delivery_instructions: string | null; notes: string | null; created_at: string; due_at: string | null;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
  doctor: { full_name: string | null; clinic_name: string | null } | null;
  order_items: { id: string; sku: string; name_ar: string; name_en: string; quantity: number; line_total: number }[];
  order_status_history: { id: number; status: string; note: string | null; created_at: string }[];
  payments: Pay[];
};
const NEXT: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['out_for_delivery', 'cancelled'], out_for_delivery: ['delivered'], delivered: [], cancelled: [] };

export default function AdminOrder() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const [o, setO] = useState<Order | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => { api<Order>(`/admin/orders/${id}`).then(setO).catch((e) => setErr(e.message)); }, [id]);

  async function act(path: string, body: object, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setErr('');
    try { setO(await api<Order>(`/admin/orders/${id}/${path}`, { method: 'POST', body: JSON.stringify(body) })); setNote(''); } catch (e) { setErr((e as Error).message); }
  }

  if (err && !o) return <p className="text-red-500">{err}</p>;
  if (!o) return <div className="h-64 animate-pulse rounded-2xl bg-surface" />;
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const pending = o.payments.find((p) => p.status === 'pending');
  const btn = 'rounded-lg border px-3 py-1.5 text-sm hover:bg-surface';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/orders" className="text-sm text-cyan-accent">← {t('aOrders')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" dir="ltr">{o.order_number}</h1>
        <div className="flex gap-2"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /></div>
      </div>
      <p className="text-lg font-semibold">{o.doctor?.full_name ?? o.profiles?.full_name ?? '—'}{o.doctor?.clinic_name && <span className="font-normal text-muted"> — {o.doctor.clinic_name}</span>}</p>
      {err && <p role="alert" className="text-red-500">{err}</p>}

      <section className="space-y-1 rounded-2xl border p-4 text-sm">
        <p><b>{t('aoCustomer')}:</b> {o.profiles?.full_name ?? '—'} <span className="text-muted" dir="ltr">{o.profiles?.email}</span></p>
        <p dir="ltr" className="text-start"><b>{t('ckPhone')}:</b> {o.phone}</p>
        <p><b>{t('orAddr')}:</b> {o.address}</p>
        {o.delivery_instructions && <p><b>{t('ckInstr')}:</b> {o.delivery_instructions}</p>}
        {o.notes && <p><b>{t('ckNotes')}:</b> {o.notes}</p>}
        <p className="text-muted">{when(o.created_at)}</p>
      </section>

      <section className="rounded-2xl border">
        <ul className="divide-y">
          {o.order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 p-4 text-sm">
              <span>{lang === 'ar' ? i.name_ar : i.name_en} <span className="text-muted" dir="ltr">· {i.sku} × {i.quantity}</span></span>
              <span dir="ltr">{money(i.line_total, lang)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t bg-surface p-4 text-sm">
          <div className="flex justify-between"><span>{t('ckFee')}</span><span dir="ltr">{money(o.delivery_fee, lang)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>{t('ckTotal')}</span><span dir="ltr">{money(o.total, lang)}</span></div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border p-4">
        <h2 className="font-medium">{t('orPay')}: {t(`pm_${o.payment_method}`)}</h2>
        {o.payment_method === 'cod' && <p className="text-sm text-muted">{t('aoCash')}</p>}
        {o.payments.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span dir="ltr">{p.reference ?? '—'}</span><span className="text-muted">{p.status}</span>
            {p.proof_url && <a href={p.proof_url} target="_blank" rel="noopener noreferrer" className="text-cyan-accent underline">{t('aoProof')}</a>}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {o.payment_status !== 'paid' && <button className={btn} onClick={() => act('payment', { action: 'confirm' }, t('aSure'))}>{t('aoConfirmPay')}</button>}
          {pending && <button className={btn} onClick={() => act('payment', { action: 'reject' }, t('aSure'))}>{t('aoRejectPay')}</button>}
          {o.payment_status === 'paid' && <button className={btn} onClick={() => act('payment', { action: 'unpaid' }, t('aSure'))}>{t('aoUnpaid')}</button>}
        </div>
      </section>

      {!['delivered', 'cancelled'].includes(o.status) && <DueControl due={o.due_at} canEdit onSet={(h) => act('due', { hours: h })} />}

      {NEXT[o.status].length > 0 && (
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="font-medium">{t('aoSetStatus')}</h2>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('aoNote')} className="w-full rounded-xl border px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            {NEXT[o.status].map((s) => <button key={s} className={`${btn} ${s === 'cancelled' ? 'text-red-500' : ''}`} onClick={() => act('status', { status: s, note: note || undefined }, t('aSure'))}>{t(`os_${s}`)}</button>)}
          </div>
        </section>
      )}

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-medium">{t('orHistory')}</h2>
        <ul className="space-y-2 text-sm">
          {[...o.order_status_history].reverse().map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2"><StatusBadge s={h.status} /><span className="text-muted">{when(h.created_at)}</span>{h.note && <span>— {h.note}</span>}</li>)}
        </ul>
      </section>
    </div>
  );
}
