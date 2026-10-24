'use client';
import { useEffect, useState } from 'react';
import { usePrefs } from '@/lib/prefs';

// One shared timer for every countdown on the page (a list of 20 rows still uses a single interval).
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) timer = setInterval(() => subs.forEach((f) => f()), 1000);
  return () => { subs.delete(cb); if (!subs.size && timer) { clearInterval(timer); timer = undefined; } };
}
function useNow() {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => subscribe(() => setN(Date.now())), []);
  return n;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Live countdown to the delivery deadline: green above 24h, amber below, red once overdue. */
export function Countdown({ due }: { due: string }) {
  const { t } = usePrefs();
  const ms = Date.parse(due) - useNow();
  const over = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const tone = over ? 'bg-red-500/15 text-red-700 dark:text-red-300' : ms < 86_400_000 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-medium ${tone}`} role="timer" aria-label={`${over ? t('cdOver') : t('cdLeft')}`}>
      <span aria-hidden>⏱</span>{over ? t('cdOver') : t('cdLeft')}
      <bdi dir="ltr" className="tabular-nums">{d > 0 ? `${d}${t('cdD')} ` : ''}{pad(h)}:{pad(m)}:{pad(s)}</bdi>
    </span>
  );
}

export const isOpenStatus = (s: string) => !['delivered', 'cancelled', 'rejected'].includes(s);
