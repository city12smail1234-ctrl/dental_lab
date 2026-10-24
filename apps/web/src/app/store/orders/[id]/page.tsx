'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PayBadge, StatusBadge } from '@/components/Badges';
import { DeliveryCard } from '@/components/DeliveryCard';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { Countdown, isOpenStatus } from '@/components/Countdown';
import { usePrefs } from '@/lib/prefs';

type Order = {
  id: string; order_number: string; status: string; payment_method: string; payment_status: string; subtotal: number; delivery_fee: number; total: number; phone: string; address: string; created_at: string; due_at: string | null;
  order_items: { id: string; sku: string; name_ar: string; name_en: string; unit_price: number; quantity: number; line_total: number }[];
  order_status_history: { id: number; status: string; note: string | null; created_at: string }[];
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Order>(`/orders/${id}`).then(setO).catch(() => setO(null)), [id]);
  useEffect(() => { load(); }, [load]);

  async function cancel() {
    if (!confirm(t('orConfirmCancel'))) return;
    setErr('');
    try { setO(await api<Order>(`/orders/${id}/cancel`, { method: 'POST' })); } catch (e) { setErr((e as Error).message); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('reference', ref); fd.append('file', file);
      setO(await api<Order>(`/orders/${id}/payment-proof`, { method: 'POST', body: fd })); setRef(''); setFile(null);
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  if (o === undefined) return <main className="mx-auto max-w-3xl p-6"><div className="h-64 animate-pulse rounded-2xl bg-surface" /></main>;
  if (o === null) return <p className="p-10 text-center text-muted">{t('stNotFound')}</p>;

  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const transfer = o.payment_method !== 'cod';
  const canPay = transfer && o.status !== 'cancelled' && ['unpaid', 'rejected'].includes(o.payment_status);
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Link href="/store/orders" className="text-sm text-cyan-accent">← {t('orMy')}</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" dir="ltr">{o.order_number}</h1>
        <div className="flex gap-2"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /></div>
      </div>
      {o.due_at && isOpenStatus(o.status) && <p className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">{t('dueTitle')}:</span><Countdown due={o.due_at} /></p>}
      {err && <p role="alert" className="text-red-500">{err}</p>}

      <section className="rounded-2xl border">
        <h2 className="border-b p-4 font-medium">{t('orItems')}</h2>
        <ul className="divide-y">
          {o.order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 p-4 text-sm">
              <span>{lang === 'ar' ? i.name_ar : i.name_en} <span className="text-muted" dir="ltr">× {i.quantity}</span></span>
              <span dir="ltr">{money(i.line_total, lang)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t bg-surface p-4 text-sm">
          <div className="flex justify-between"><span>{t('stSubtotal')}</span><span dir="ltr">{money(o.subtotal, lang)}</span></div>
          <div className="flex justify-between"><span>{t('ckFee')}</span><span dir="ltr">{money(o.delivery_fee, lang)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>{t('ckTotal')}</span><span dir="ltr">{money(o.total, lang)}</span></div>
        </div>
      </section>

      <section className="space-y-1 rounded-2xl border p-4 text-sm">
        <p><b>{t('orAddr')}:</b> {o.address}</p>
        <p dir="ltr" className="text-start"><b>{t('ckPhone')}:</b> {o.phone}</p>
        <p><b>{t('orPay')}:</b> {t(`pm_${o.payment_method}`)}</p>
      </section>

      {transfer && o.payment_status === 'awaiting_confirmation' && <p className="rounded-xl bg-surface p-4 text-sm">{t('orProofSent')}</p>}
      {canPay && (
        <form onSubmit={send} className="space-y-3 rounded-2xl border p-4">
          <h2 className="font-medium">{t('orProofT')}</h2>
          {o.payment_status === 'rejected' && <p className="text-sm text-red-500">{t('orProofRej')}</p>}
          <input required minLength={3} maxLength={60} className={f} placeholder={t('orRef')} value={ref} onChange={(e) => setRef(e.target.value)} />
          <label className="block text-sm text-muted">{t('orFile')}<input required type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <button disabled={busy || !file} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? '…' : t('orSend')}</button>
        </form>
      )}

      <DeliveryCard orderId={o.id} />

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-medium">{t('orHistory')}</h2>
        <ul className="space-y-2 text-sm">
          {[...o.order_status_history].reverse().map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2"><StatusBadge s={h.status} /><span className="text-muted">{when(h.created_at)}</span>{h.note && <span>— {h.note}</span>}</li>
          ))}
        </ul>
      </section>

      {o.status === 'pending' && <button onClick={cancel} className="rounded-xl border border-red-500/50 px-5 py-2 text-sm text-red-500">{t('orCancel')}</button>}
    </main>
  );
}
