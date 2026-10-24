'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type R = {
  from: string; to: string; billed: number; collected: number; outstanding: number;
  orders: { count: number; total: number }; cases: { count: number; total: number };
  by_doctor: { name: string | null; billed: number }[]; top_products: { sku: string; name: string; qty: number; revenue: number }[];
  daily: { day: string; orders: number; cases: number }[];
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
type Row = { type: 'order' | 'case'; number: string; at: string; doctor: string | null; clinic: string | null; phone: string | null; items: string; status: string; payment: string | null; total: number };

// Spreadsheet apps run text that starts with = + - @ as a formula, so such text is neutralised.
const cell = (v: string | number) => { const s = String(v ?? ''); return `"${(typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };

export default function Reports() {
  const { t, lang } = usePrefs();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => { setErr(''); api<R>(`/admin/reports?from=${from}&to=${to}`).then(setR).catch((e) => setErr(e.message)); }, [from, to]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function download(name: string, rows: (string | number)[][]) {
    const blob = new Blob(['\uFEFF' + rows.map((x) => x.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    if (!r) return;
    download(`summary-${r.from}_${r.to}.csv`, [['date', 'orders', 'cases'], ...r.daily.map((d) => [d.day, d.orders, d.cases]), [], ['doctor', 'billed'], ...r.by_doctor.map((d) => [d.name ?? '', d.billed]), [], ['sku', 'product', 'qty', 'revenue'], ...r.top_products.map((p) => [p.sku, p.name, p.qty, p.revenue])]);
  }

  // one line per order / case, with the doctor's name and clinic first
  async function exportDetails() {
    setErr('');
    try {
      const res = await api<{ from: string; to: string; rows: Row[] }>(`/admin/reports/export?from=${from}&to=${to}`);
      const head = lang === 'ar' ? ['الدكتور', 'العيادة', 'الموبايل', 'النوع', 'الرقم', 'التاريخ', 'التفاصيل', 'الحالة', 'الدفع', 'الإجمالي'] : ['Doctor', 'Clinic', 'Phone', 'Type', 'Number', 'Date', 'Details', 'Status', 'Payment', 'Total'];
      const fmt = (x: string) => new Date(x).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' });
      download(`details-${res.from}_${res.to}.csv`, [head, ...res.rows.map((x) => [x.doctor ?? '', x.clinic ?? '', x.phone ?? '', t(`rpType_${x.type}`), x.number, fmt(x.at), x.items, t(`${x.type === 'order' ? 'os' : 'cs'}_${x.status}`), x.payment ? t(`ps_${x.payment}`) : '', x.total])]);
    } catch (e) { setErr((e as Error).message); }
  }

  const f = 'rounded-xl border px-3 py-2 text-sm';
  const max = Math.max(1, ...(r?.daily.map((d) => d.orders + d.cases) ?? [1]));
  const card = 'rounded-2xl border bg-surface p-5';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('rpTitle')}</h1>
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">{t('rpFrom')}<input type="date" dir="ltr" required className={`${f} mt-1 block`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">{t('rpTo')}<input type="date" dir="ltr" required className={`${f} mt-1 block`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('rpApply')}</button>
        <button type="button" onClick={exportDetails} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface">{t('rpExportDetails')}</button>
        <button type="button" onClick={exportCsv} disabled={!r} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface disabled:opacity-40">{t('rpExport')}</button>
        <button type="button" onClick={() => window.print()} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface">{t('acctPrint')}</button>
      </form>
      {err && <p role="alert" className="text-red-500">{err}</p>}
      {!r && !err && <div className="h-40 animate-pulse rounded-2xl bg-surface" />}

      {r && (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className={card}><p className="text-sm text-muted">{t('rpBilled')}</p><p className="mt-2 text-2xl font-semibold" dir="ltr">{money(r.billed, lang)}</p><p className="text-xs text-muted">{t('rpNoteBilled')}</p></div>
            <div className={card}><p className="text-sm text-muted">{t('rpCollected')}</p><p className="mt-2 text-2xl font-semibold" dir="ltr">{money(r.collected, lang)}</p></div>
            <div className={card}><p className="text-sm text-muted">{t('rpOrders')}</p><p className="mt-2 text-2xl font-semibold" dir="ltr">{r.orders.count}</p><p className="text-xs text-muted" dir="ltr">{money(r.orders.total, lang)}</p></div>
            <div className={card}><p className="text-sm text-muted">{t('rpCases')}</p><p className="mt-2 text-2xl font-semibold" dir="ltr">{r.cases.count}</p><p className="text-xs text-muted" dir="ltr">{money(r.cases.total, lang)}</p></div>
          </section>
          <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">{t('rpOutstanding')}: <b dir="ltr">{money(r.outstanding, lang)}</b></p>

          <section>
            <h2 className="mb-3 font-semibold">{t('rpDaily')}</h2>
            <div className="flex h-36 items-end gap-1 overflow-x-auto rounded-2xl border p-3" role="img" aria-label={t('rpDaily')}>
              {r.daily.map((d) => (
                <div key={d.day} title={`${d.day}: ${money(d.orders + d.cases, lang)}`} className="flex min-w-2 flex-1 flex-col justify-end">
                  <div className="rounded-t bg-cyan-accent" style={{ height: `${Math.max(2, ((d.orders + d.cases) / max) * 100)}%` }} />
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border p-5">
              <h2 className="mb-3 font-semibold">{t('rpTopDoctors')}</h2>
              {r.by_doctor.length === 0 && <p className="text-sm text-muted">{t('aNone')}</p>}
              <ul className="divide-y text-sm">{r.by_doctor.map((d, i) => <li key={i} className="flex justify-between py-2"><span>{d.name ?? '—'}</span><b dir="ltr">{money(d.billed, lang)}</b></li>)}</ul>
            </section>
            <section className="rounded-2xl border p-5">
              <h2 className="mb-3 font-semibold">{t('rpTopProducts')}</h2>
              {r.top_products.length === 0 && <p className="text-sm text-muted">{t('aNone')}</p>}
              <ul className="divide-y text-sm">{r.top_products.map((p) => <li key={p.sku} className="flex justify-between gap-3 py-2"><span>{p.name} <span className="text-muted" dir="ltr">× {p.qty}</span></span><b dir="ltr">{money(p.revenue, lang)}</b></li>)}</ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
