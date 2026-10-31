'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

export type Invoice = { case_id: string; case_number: string; service_name_ar: string; service_name_en: string; quantity: number; total: number; delivered_at: string; paid: number; remaining: number };

export const invStatus = (i: Invoice) => (i.remaining <= 0 ? 'paid' : i.paid > 0 ? 'partial' : 'unpaid');
export const INV_TONE: Record<string, string> = { paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', partial: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', unpaid: 'bg-red-500/15 text-red-700 dark:text-red-300' };

/** The invoice of a delivered case, with a payment bar and a Pay button (full or partial). */
export function CaseInvoice({ caseId }: { caseId: string }) {
  const { t, lang } = usePrefs();
  const [inv, setInv] = useState<Invoice | null | undefined>(undefined);
  useEffect(() => { api<{ invoices: Invoice[] }>('/account').then((s) => setInv(s.invoices.find((i) => i.case_id === caseId) ?? null)).catch(() => setInv(null)); }, [caseId]);
  if (!inv) return null;
  const st = invStatus(inv);
  const pct = Math.min(100, Math.round((inv.paid / inv.total) * 100));
  return (
    <section className="space-y-3 rounded-2xl border p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">{t('invTitle')} <span className="text-muted" dir="ltr">{inv.case_number}</span></h2><span className={`rounded-full px-3 py-0.5 text-xs ${INV_TONE[st]}`}>{t(`invS_${st}`)}</span></div>
      <p className="text-muted">{lang === 'ar' ? inv.service_name_ar : inv.service_name_en}{inv.quantity > 1 ? ` ×${inv.quantity}` : ''}</p>
      <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <p><span className="block text-xs text-muted">{t('csTotal')}</span><b dir="ltr">{money(inv.total, lang)}</b></p>
        <p><span className="block text-xs text-muted">{t('invPaid')}</span><b dir="ltr">{money(inv.paid, lang)}</b></p>
        <p><span className="block text-xs text-muted">{t('invRemaining')}</span><b dir="ltr">{money(inv.remaining, lang)}</b></p>
      </div>
      {inv.remaining > 0 && (<><Link href={`/account?pay=${inv.remaining}`} className="inline-block rounded-full bg-navy-900 px-5 py-2 font-medium text-white">{t('invPay')}</Link><p className="text-xs text-muted">{t('invHint')}</p></>)}
    </section>
  );
}
