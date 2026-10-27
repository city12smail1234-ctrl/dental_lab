'use client';
import { useState } from 'react';
import { usePrefs } from '@/lib/prefs';

const rng = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => (a <= b ? a + i : a - i));
// FDI notation, drawn the way a dentist reads a chart: the patient's right side is on the viewer's left.
const PERM = { upper: [...rng(18, 11), ...rng(21, 28)], lower: [...rng(48, 41), ...rng(31, 38)] };
const PRIM = { upper: [...rng(55, 51), ...rng(61, 65)], lower: [...rng(85, 81), ...rng(71, 75)] };
const kind = (n: number, primary: boolean) => { const d = n % 10; return d <= 2 ? 'incisor' : d === 3 ? 'canine' : primary || d >= 6 ? 'molar' : 'premolar'; };
const GROW: Record<string, number> = { incisor: 22, canine: 24, premolar: 26, molar: 34 };
const HEIGHT: Record<string, number> = { incisor: 34, canine: 38, premolar: 32, molar: 30 };
const SHAPE = 'M8 1C4 1 2 3.5 2 8c0 3 1 5 1.5 8 .5 3.5 1 7 2.5 7 1.7 0 1.5-5 2-5s.3 5 2 5c1.5 0 2-3.5 2.5-7 .5-3 1.5-5 1.5-8 0-4.5-2-7-6-7z';

function Jaw({ teeth, selected, toggle, primary, upper }: { teeth: number[]; selected: Set<number>; toggle: (n: number) => void; primary: boolean; upper: boolean }) {
  const mid = (teeth.length - 1) / 2;
  return (
    <div className="flex items-end gap-[3px]" style={{ paddingBottom: upper ? 28 : 0, paddingTop: upper ? 0 : 28 }}>
      {teeth.map((n, i) => {
        const k = kind(n, primary); const on = selected.has(n);
        const off = Math.round(Math.pow(Math.abs(i - mid) / mid, 2) * 26);   // the arch: the back teeth sit lower/higher than the front ones
        return (
          <button
            key={n} type="button" aria-pressed={on} aria-label={`${n}`} onClick={() => toggle(n)}
            className={`group flex min-w-0 flex-col items-center gap-0.5 rounded-md outline-offset-2 transition-transform hover:-translate-y-0.5 ${i === Math.ceil(mid) ? 'ms-2' : ''}`}
            style={{ flex: `${GROW[k]} 1 0`, transform: `translateY(${upper ? off : -off}px)` }}
          >
            {!upper && <span className={`text-[10px] tabular-nums ${on ? 'font-bold text-cyan-accent' : 'text-muted'}`}>{n}</span>}
            <svg viewBox="0 0 16 24" preserveAspectRatio="none" className="w-full" style={{ height: HEIGHT[k], transform: upper ? 'none' : 'scaleY(-1)' }} aria-hidden>
              <path d={SHAPE} strokeWidth="1.2" className={on ? 'fill-cyan-accent stroke-navy-700' : 'fill-bg stroke-muted group-hover:fill-surface'} />
            </svg>
            {upper && <span className={`text-[10px] tabular-nums ${on ? 'font-bold text-cyan-accent' : 'text-muted'}`}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Pick teeth by tapping them on an upper/lower jaw chart instead of typing numbers. */
export function ToothChart({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t } = usePrefs();
  const [primary, setPrimary] = useState(false);
  const set = new Set(value);
  const jaws = primary ? PRIM : PERM;
  const toggle = (n: number) => { const s = new Set(value); if (s.has(n)) s.delete(n); else s.add(n); onChange([...s].sort((a, b) => a - b)); };
  const addAll = (list: number[]) => onChange([...new Set([...value, ...list])].sort((a, b) => a - b));
  const tab = (on: boolean) => `rounded-full px-3 py-1 text-xs ${on ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`;

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{t('csTeeth')}</p>
        <div className="flex gap-2">
          <button type="button" className={tab(!primary)} onClick={() => setPrimary(false)}>{t('tcPerm')}</button>
          <button type="button" className={tab(primary)} onClick={() => setPrimary(true)}>{t('tcPrimary')}</button>
        </div>
      </div>

      <div className="overflow-x-auto" dir="ltr">
        <div className="min-w-[420px] space-y-1">
          <p className="text-center text-xs text-muted">{t('tcUpper')}</p>
          <Jaw teeth={jaws.upper} selected={set} toggle={toggle} primary={primary} upper />
          <div className="flex items-center gap-2 text-[10px] text-muted"><span>{t('tcRight')}</span><span className="h-px flex-1 bg-line" /><span>{t('tcLeft')}</span></div>
          <Jaw teeth={jaws.lower} selected={set} toggle={toggle} primary={primary} upper={false} />
          <p className="text-center text-xs text-muted">{t('tcLower')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="rounded-lg border px-3 py-1 hover:bg-surface" onClick={() => addAll(jaws.upper)}>{t('tcAllUpper')}</button>
        <button type="button" className="rounded-lg border px-3 py-1 hover:bg-surface" onClick={() => addAll(jaws.lower)}>{t('tcAllLower')}</button>
        <button type="button" className="rounded-lg border px-3 py-1 hover:bg-surface" onClick={() => onChange([])}>{t('tcClear')}</button>
      </div>
      <p className="text-sm" aria-live="polite"><span className="text-muted">{t('tcSelected')}: </span><b dir="ltr">{value.length ? value.join(', ') : t('tcNone')}</b></p>
    </div>
  );
}
