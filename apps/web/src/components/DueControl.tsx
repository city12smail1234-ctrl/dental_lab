'use client';
import { useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { Countdown } from './Countdown';

/** The lab picks "2 days" or "36 hours" from now; the doctor then sees a live countdown. */
export function DueControl({ due, canEdit, onSet }: { due: string | null; canEdit: boolean; onSet: (hours: number | null) => void }) {
  const { t } = usePrefs();
  const [n, setN] = useState('2');
  const [unit, setUnit] = useState<'h' | 'd'>('d');
  const hours = Math.round((Number(n) || 0) * (unit === 'd' ? 24 : 1));
  const f = 'rounded-xl border px-3 py-2 text-sm';
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h2 className="font-medium">{t('dueTitle')}</h2>
      <div>{due ? <Countdown due={due} /> : <span className="text-sm text-muted">{t('dueNone')}</span>}</div>
      {canEdit && (
        <>
          <p className="text-xs text-muted">{t('dueHint')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min={1} max={unit === 'd' ? 90 : 2160} dir="ltr" aria-label={t('dueAmount')} className={`${f} w-24`} value={n} onChange={(e) => setN(e.target.value)} />
            <select className={`${f} bg-surface`} value={unit} onChange={(e) => setUnit(e.target.value as 'h' | 'd')} aria-label={t('dueAmount')}>
              <option value="d">{t('dueUnitD')}</option><option value="h">{t('dueUnitH')}</option>
            </select>
            <button disabled={hours < 1 || hours > 2160} onClick={() => onSet(hours)} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{t('dueSet')}</button>
            {due && <button onClick={() => onSet(null)} className="rounded-lg border px-3 py-2 text-sm hover:bg-surface">{t('dueClear')}</button>}
          </div>
        </>
      )}
    </section>
  );
}
