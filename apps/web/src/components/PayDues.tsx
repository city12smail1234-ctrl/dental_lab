'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';

type Opts = { methods: { id: string; number?: string; handle?: string; name?: string }[]; balance: number };
type Row = { id: string; amount: number; method: string; reference: string; status: string; reject_reason: string | null; created_at: string };
const TONE: Record<string, string> = { pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', rejected: 'bg-red-500/15 text-red-700 dark:text-red-300' };

/** The doctor pays what he owes: transfer, upload the receipt, and the lab confirms. A confirmed payment is deducted from his account at once. */
export function PayDues({ balance, onChange }: { balance: number; onChange: () => void }) {
  const { t, lang } = usePrefs();
  const MAX = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 5;
  const [o, setO] = useState<Opts | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api<Opts>('/account/payment-options').then((x) => { setO(x); setMethod((m) => m || x.methods[0]?.id || ''); }).catch(() => {});
    api<Row[]>('/account/payments').then((r) => setRows((old) => { if (old.length && r.some((n) => old.find((p) => p.id === n.id)?.status !== n.status)) onChange(); return r; })).catch(() => {});
  }, [onChange]);
  useEffect(() => { load(); }, [load]);
  usePolling(load);

  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!file) return;
    if (file.size > MAX * 1048576) { setMsg({ ok: false, text: t('fiTooBig').replace('{n}', String(MAX)) }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('amount', amount); fd.append('method', method); fd.append('reference', ref); fd.append('file', file);
      setRows(await api<Row[]>('/account/payments', { method: 'POST', body: fd }));
      setMsg({ ok: true, text: t('payDSent') }); setOpen(false); setAmount(''); setRef(''); setFile(null);
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    setBusy(false);
  }

  if (!o) return null;
  const sel = o.methods.find((m) => m.id === method);
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const when = (x: string) => new Date(x).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });

  return (
    <section className="space-y-4 rounded-2xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t('payDTitle')}</h2>
        {!open && o.methods.length > 0 && <button onClick={() => { setOpen(true); setMsg(null); if (balance > 0) setAmount(String(balance)); }} className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('payDTitle')}</button>}
      </div>
      {o.methods.length === 0 && <p className="text-sm text-muted">{t('payDNone')}</p>}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{msg.text}</p>}

      {open && (
        <form onSubmit={send} className="space-y-3 rounded-xl bg-surface p-4">
          <p className="text-sm text-muted">{t('payDHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">{t('payDAmount')}<input required type="number" min="1" step="0.01" dir="ltr" className={`${f} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="text-sm">{t('payDMethod')}<select className={`${f} mt-1 bg-bg`} value={method} onChange={(e) => setMethod(e.target.value)}>{o.methods.map((m) => <option key={m.id} value={m.id}>{t(`pm_${m.id}`)}</option>)}</select></label>
          </div>
          {sel && <p className="rounded-lg bg-bg p-3 text-sm">{t('ckTo')}: <b dir="ltr">{sel.number ?? sel.handle}</b>{sel.name ? ` — ${t('ckAccName')}: ${sel.name}` : ''}</p>}
          <label className="block text-sm">{t('payDRef')}<input required minLength={3} maxLength={60} className={`${f} mt-1`} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="block text-sm text-muted">{t('payDFile')}<input required type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <div className="flex gap-2">
            <button disabled={busy || !file} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? '…' : t('payDSend')}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2 text-sm">{t('pCancel')}</button>
          </div>
        </form>
      )}

      {rows.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">{t('payDMine')}</p>
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b dir="ltr">{money(r.amount, lang)}</b> · {t(`pm_${r.method}`)} · <span className="text-muted" dir="ltr">{r.reference}</span> · <span className="text-muted">{when(r.created_at)}</span>
                  {r.status === 'rejected' && r.reject_reason && <span className="block text-xs text-red-500">{t('payDReason')}: {r.reject_reason}</span>}</span>
                <span className={`rounded-full px-3 py-0.5 text-xs ${TONE[r.status]}`}>{t(`dp_${r.status}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
