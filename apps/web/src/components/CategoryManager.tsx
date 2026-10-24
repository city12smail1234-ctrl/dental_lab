'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type Cat = { id: string; name_ar: string; name_en: string; sort_order: number; is_active: boolean };
type Draft = { name_ar: string; name_en: string; sort_order: string; is_active: boolean };

/** Edit, reorder, deactivate or delete the categories that already exist. Works for both product and lab-service categories. */
export function CategoryManager({ base, categories, onChanged }: { base: string; categories: Cat[]; onChanged: () => void }) {
  const { t } = usePrefs();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {   // keep drafts in step with the server list, without discarding what is being typed
    setDrafts((d) => Object.fromEntries(categories.map((c) => [c.id, d[c.id] ?? { name_ar: c.name_ar, name_en: c.name_en, sort_order: String(c.sort_order), is_active: c.is_active }])));
  }, [categories]);

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  async function save(id: string) {
    const d = drafts[id]; setErr(''); setSaved('');
    try {
      await api(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify({ name_ar: d.name_ar.trim(), name_en: d.name_en.trim(), sort_order: Number(d.sort_order) || 0, is_active: d.is_active }) });
      setSaved(id); onChanged();
    } catch (e) { setErr((e as Error).message); }
  }
  async function remove(id: string) {
    if (!confirm(t('ctConfirmDelete'))) return;
    setErr('');
    try { await api(`${base}/${id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr((e as Error).message); }
  }

  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  return (
    <details className="rounded-2xl border p-4">
      <summary className="cursor-pointer text-sm font-medium">{t('ctEdit')}</summary>
      <p className="mt-2 text-xs text-muted">{t('ctHint')}</p>
      {err && <p role="alert" className="mt-2 text-sm text-red-500">{err}</p>}
      <ul className="mt-3 space-y-3">
        {categories.map((c) => {
          const d = drafts[c.id]; if (!d) return null;
          return (
            <li key={c.id} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-center ${d.is_active ? '' : 'opacity-70'}`}>
              <input className={f} value={d.name_ar} onChange={(e) => set(c.id, { name_ar: e.target.value })} aria-label={t('pCatAr')} />
              <input className={f} dir="ltr" value={d.name_en} onChange={(e) => set(c.id, { name_en: e.target.value })} aria-label={t('pCatEn')} />
              <input className={f} type="number" min={0} dir="ltr" value={d.sort_order} onChange={(e) => set(c.id, { sort_order: e.target.value })} aria-label={t('ctOrder')} />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" checked={d.is_active} onChange={(e) => set(c.id, { is_active: e.target.checked })} />{t('ctActive')}</label>
                <button onClick={() => save(c.id)} disabled={!d.name_ar.trim() || !d.name_en.trim()} className="rounded-lg border px-3 py-1.5 hover:bg-surface disabled:opacity-40">{saved === c.id ? '✓' : t('ctSave')}</button>
                <button onClick={() => remove(c.id)} className="rounded-lg border px-3 py-1.5 text-red-500 hover:bg-surface">{t('ctDelete')}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
