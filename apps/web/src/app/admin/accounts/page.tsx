'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';

type B = { doctor_id: string; full_name: string | null; email: string | null; clinic_name: string | null; balance: number };

export default function Accounts() {
  const { t, lang } = usePrefs();
  const [list, setList] = useState<B[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api<B[]>('/admin/accounts').then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  usePolling(load);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (list ?? []).filter((d) => !k || [d.full_name, d.clinic_name, d.email].some((v) => v?.toLowerCase().includes(k)));
  }, [list, q]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('aAccounts')}</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('acaSearch')} className="w-full rounded-full border px-4 py-2 text-sm sm:w-80" />
      {err && <p className="text-red-500">{err}</p>}
      {!list && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {list && shown.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('aNone')}</p>}
      <ul className="space-y-3">
        {shown.map((d) => {
          const b = Number(d.balance);
          return (
            <li key={d.doctor_id}>
              <Link href={`/admin/accounts/${d.doctor_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-surface">
                <div className="text-sm"><p className="font-medium">{d.full_name ?? t('aNoName')} <span className="text-muted">— {d.clinic_name ?? '—'}</span></p><p className="text-muted" dir="ltr">{d.email}</p></div>
                <div className="text-end text-sm">
                  <p className="font-semibold" dir="ltr">{money(Math.abs(b), lang)}</p>
                  <p className={b > 0 ? 'text-amber-600 dark:text-amber-300' : b < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}>{b > 0 ? t('acaOwes') : b < 0 ? t('acaCredit') : t('acaSettled')}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
