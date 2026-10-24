'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Entry = { id: number; kind: string; amount: number; source_type: string; source_id: string | null; reference: string | null; method: string | null; note: string | null; created_at: string };
type Stmt = { summary: { balance: number; charged: number; credited: number }; entries: Entry[]; doctor: { full_name: string | null; email: string | null; clinic_name: string | null } };
const METHODS = ['cash', 'vodafone_cash', 'instapay', 'bank', 'other'];

export default function AdminAccount() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const [s, setS] = useState<Stmt | null>(null);
  const [err, setErr] = useState('');
  const [pay, setPay] = useState({ amount: '', method: 'cash', note: '' });
  const [adj, setAdj] = useState({ amount: '', note: '' });

  useEffect(() => { api<Stmt>(`/admin/accounts/${id}`).then(setS).catch((e) => setErr(e.message)); }, [id]);

  async function post(path: string, body: object, reset: () => void) {
    setErr('');
    try { setS(await api<Stmt>(`/admin/accounts/${id}/${path}`, { method: 'POST', body: JSON.stringify(body) })); reset(); } catch (e) { setErr((e as Error).message); }
  }

  if (err && !s) return <p className="text-red-500">{err}</p>;
  if (!s) return <div className="h-48 animate-pulse rounded-2xl bg-surface" />;
  const b = Number(s.summary.balance);
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const link = (e: Entry) => (e.source_type === 'order' ? `/admin/orders/${e.source_id}` : e.source_type === 'case' ? `/admin/cases/${e.source_id}` : null);
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/accounts" className="text-sm text-cyan-accent">← {t('aAccounts')}</Link>
      <h1 className="text-2xl font-semibold">{s.doctor.full_name ?? t('aNoName')} <span className="text-base font-normal text-muted">— {s.doctor.clinic_name ?? '—'}</span></h1>
      <button onClick={() => window.print()} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-surface print:hidden">{t('acctPrint')}</button>
      {err && <p role="alert" className="text-red-500">{err}</p>}

      <section className={`rounded-3xl border p-6 ${b > 0 ? 'bg-amber-500/10' : b < 0 ? 'bg-emerald-500/10' : 'bg-surface'}`}>
        <p className="text-sm text-muted">{b > 0 ? t('acaOwes') : b < 0 ? t('acaCredit') : t('acaSettled')}</p>
        <p className="text-4xl font-semibold" dir="ltr">{money(Math.abs(b), lang)}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <form className="space-y-2 rounded-2xl border p-4" onSubmit={(e) => { e.preventDefault(); post('payments', { amount: Number(pay.amount), method: pay.method, note: pay.note || undefined }, () => setPay({ amount: '', method: 'cash', note: '' })); }}>
          <h2 className="font-medium">{t('acaRecordPay')}</h2>
          <input required type="number" min="0.01" step="0.01" dir="ltr" placeholder={t('acaAmount')} className={f} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <select className={f} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} aria-label={t('acaMethod')}>{METHODS.map((m) => <option key={m} value={m}>{t(`pm_${m}`)}</option>)}</select>
          <input maxLength={300} placeholder={t('acaNote')} className={f} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
          <button className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('pSave')}</button>
        </form>
        <form className="space-y-2 rounded-2xl border p-4" onSubmit={(e) => { e.preventDefault(); post('adjustments', { amount: Number(adj.amount), note: adj.note }, () => setAdj({ amount: '', note: '' })); }}>
          <h2 className="font-medium">{t('acaAdjust')}</h2>
          <input required type="number" step="0.01" dir="ltr" placeholder={t('acaAmount')} className={f} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
          <input required minLength={3} maxLength={300} placeholder={t('aoNote')} className={f} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
          <p className="text-xs text-muted">{t('acaAdjustHint')}</p>
          <button className="rounded-xl border px-5 py-2 text-sm hover:bg-surface">{t('pSave')}</button>
        </form>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">{t('acctEntries')}</h2>
        {s.entries.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('acctNone')}</p>}
        <ul className="divide-y rounded-2xl border">
          {s.entries.map((e) => {
            const h = link(e);
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
    </div>
  );
}
