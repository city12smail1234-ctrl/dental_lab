'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { INV_TONE, Invoice, invStatus } from '@/components/CaseInvoice';
import { PayDues } from '@/components/PayDues';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';

export type Entry = { id: number; kind: string; amount: number; source_type: string; source_id: string | null; reference: string | null; method: string | null; note: string | null; created_at: string };
type Stmt = { summary: { balance: number; charged: number; credited: number }; entries: Entry[]; invoices: Invoice[] };

export default function Account() {
  const { t, lang } = usePrefs();
  const [s, setS] = useState<Stmt | null>(null);
  const [err, setErr] = useState('');
  const [pay, setPay] = useState<number | null>(null);
  useEffect(() => { const v = Number(new URLSearchParams(location.search).get('pay')); if (v > 0) setPay(v); }, []);
  const load = useCallback(() => api<Stmt>('/account').then(setS).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  usePolling(load);

  if (!s) return <main className="mx-auto max-w-3xl p-6">{err ? <p className="text-red-500">{err}</p> : <div className="h-48 animate-pulse rounded-2xl bg-surface" />}</main>;
  const b = s.summary.balance;
  const when = (x: string) => new Date(x).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });
  const href = (e: Entry) => (e.source_type === 'order' ? `/store/orders/${e.source_id}` : e.source_type === 'case' ? `/cases/${e.source_id}` : null);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-semibold">{t('acctTitle')}</h1><button onClick={() => window.print()} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-surface print:hidden">{t('acctPrint')}</button></div>
      <section className={`rounded-3xl border p-6 ${b > 0 ? 'bg-amber-500/10' : b < 0 ? 'bg-emerald-500/10' : 'bg-surface'}`}>
        <p className="text-sm text-muted">{b > 0 ? t('acctOwe') : b < 0 ? t('acctCredit') : t('acctSettled')}</p>
        <p className="mt-1 text-4xl font-semibold" dir="ltr">{money(Math.abs(b), lang)}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <p><span className="block text-muted">{t('acctCharged')}</span><b dir="ltr">{money(s.summary.charged, lang)}</b></p>
          <p><span className="block text-muted">{t('acctPaid')}</span><b dir="ltr">{money(s.summary.credited, lang)}</b></p>
        </div>
      </section>
      {s.invoices.length > 0 && (
        <section className="space-y-3 rounded-2xl border p-5">
          <h2 className="font-semibold">{t('invList')}</h2>
          <ul className="divide-y text-sm">
            {s.invoices.map((i) => { const st = invStatus(i); return (
              <li key={i.case_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span><Link href={`/cases/${i.case_id}`} className="font-medium text-cyan-accent" dir="ltr">{i.case_number}</Link> · {lang === 'ar' ? i.service_name_ar : i.service_name_en}{i.quantity > 1 ? ` ×${i.quantity}` : ''}
                  <span className="block text-muted" dir="ltr">{money(i.total, lang)} · {t('invPaid')} {money(i.paid, lang)} · {t('invRemaining')} {money(i.remaining, lang)}</span></span>
                <span className="flex items-center gap-2"><span className={`rounded-full px-3 py-0.5 text-xs ${INV_TONE[st]}`}>{t(`invS_${st}`)}</span>
                  {i.remaining > 0 && <button onClick={() => setPay(i.remaining + Math.random() * 1e-9)} className="rounded-lg border px-3 py-1 hover:bg-surface">{t('invPay')}</button>}</span>
              </li>); })}
          </ul>
          <p className="text-xs text-muted">{t('invHint')}</p>
        </section>
      )}
      <PayDues balance={b} onChange={load} prefill={pay} />
      <p className="text-sm text-muted">{t('acctNote')}</p>
      <section>
        <h2 className="mb-3 font-semibold">{t('acctEntries')}</h2>
        {s.entries.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('acctNone')}</p>}
        <ul className="divide-y rounded-2xl border">
          {s.entries.map((e) => {
            const h = href(e);
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">{t(`ak_${e.kind}`)} · {t(`as_${e.source_type}`)} {h ? <Link href={h} className="text-cyan-accent" dir="ltr">{e.reference}</Link> : <span dir="ltr">{e.reference}</span>}</p>
                  <p className="text-muted">{when(e.created_at)}{e.method ? ` · ${t(`pm_${e.method}`)}` : ''}{e.note ? ` · ${e.note}` : ''}</p>
                </div>
                <b dir="ltr" className={e.amount < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}>{e.amount > 0 ? '+' : '−'}{money(Math.abs(e.amount), lang)}</b>
              </li>
            );
          })}
        </ul>
      </section>
      <Link href="/store/orders" className="text-sm text-cyan-accent">{t('nvOrders')} →</Link>
    </main>
  );
}
