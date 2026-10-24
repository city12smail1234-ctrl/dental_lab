'use client';
import { usePrefs } from '@/lib/prefs';

const ORDER: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', confirmed: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  processing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', out_for_delivery: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  delivered: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', cancelled: 'bg-red-500/15 text-red-700 dark:text-red-300',
};
const PAY: Record<string, string> = {
  unpaid: 'bg-slate-500/15 text-slate-700 dark:text-slate-300', awaiting_confirmation: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', rejected: 'bg-red-500/15 text-red-700 dark:text-red-300',
};
const cls = 'inline-block rounded-full px-3 py-0.5 text-xs';

export function StatusBadge({ s }: { s: string }) { const { t } = usePrefs(); return <span className={`${cls} ${ORDER[s]}`}>{t(`os_${s}`)}</span>; }
export function PayBadge({ s }: { s: string }) { const { t } = usePrefs(); return <span className={`${cls} ${PAY[s]}`}>{t(`ps_${s}`)}</span>; }

const CASE: Record<string, string> = {
  submitted: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', info_required: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  approved: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', designing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', milling: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  finishing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', quality_control: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  ready_for_delivery: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', out_for_delivery: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  delivered: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', on_hold: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-300', cancelled: 'bg-red-500/15 text-red-700 dark:text-red-300',
};
export function CaseBadge({ s }: { s: string }) { const { t } = usePrefs(); return <span className={`${cls} ${CASE[s]}`}>{t(`cs_${s}`)}</span>; }

const DELIVERY: Record<string, string> = {
  awaiting_confirmation: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', confirmed: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', preparing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  ready_for_dispatch: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', out_for_delivery: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  delivered: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
  rescheduled: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', cancelled: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};
export function DeliveryBadge({ s }: { s: string }) { const { t } = usePrefs(); return <span className={`${cls} ${DELIVERY[s]}`}>{t(`dv_${s}`)}</span>; }
