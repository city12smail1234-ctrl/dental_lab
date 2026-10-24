'use client';
import { useCallback, useEffect, useState } from 'react';
import { CategoryManager } from '@/components/CategoryManager';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Cat = { id: string; name_ar: string; name_en: string };
type Svc = { id: string; category_id: string; name_ar: string; name_en: string; description_ar: string | null; description_en: string | null; material: string | null; price: number; turnaround_days: number | null; notes: string | null; is_active: boolean; image_url: string | null };
type Form = { id?: string; category_id: string; name_ar: string; name_en: string; description_ar: string; description_en: string; material: string; price: string; turnaround_days: string; notes: string };
const EMPTY: Form = { category_id: '', name_ar: '', name_en: '', description_ar: '', description_en: '', material: '', price: '', turnaround_days: '', notes: '' };
const nul = (v: string) => (v.trim() ? v.trim() : null);

export default function Prices() {
  const { t, lang } = usePrefs();
  const [data, setData] = useState<{ categories: Cat[]; services: Svc[] } | null>(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [cat, setCat] = useState({ ar: '', en: '' });
  const [img, setImg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api('/admin/lab-services')); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nm = (o: { name_ar: string; name_en: string }) => (lang === 'ar' ? o.name_ar : o.name_en);
  const catName = (id: string) => { const c = data?.categories.find((x) => x.id === id); return c ? nm(c) : ''; };

  async function addCat(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await api('/admin/lab-services/categories', { method: 'POST', body: JSON.stringify({ name_ar: cat.ar, name_en: cat.en }) }); setCat({ ar: '', en: '' }); load(); }
    catch (x) { setErr((x as Error).message); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return;
    setSaving(true); setErr('');
    const body = {
      category_id: form.category_id, name_ar: form.name_ar.trim(), name_en: form.name_en.trim(),
      description_ar: nul(form.description_ar), description_en: nul(form.description_en), material: nul(form.material), notes: nul(form.notes),
      price: Number(form.price), turnaround_days: form.turnaround_days.trim() ? Number(form.turnaround_days) : null,
    };
    try {
      await api(form.id ? `/admin/lab-services/${form.id}` : '/admin/lab-services', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setForm(null); load();
    } catch (x) { setErr((x as Error).message); }
    setSaving(false);
  }

  async function upload(file: File) {
    setSaving(true); setErr('');
    try { const fd = new FormData(); fd.append('file', file); const r = await api<Svc>(`/admin/lab-services/${form!.id}/image`, { method: 'POST', body: fd }); setImg(r.image_url); load(); }
    catch (x) { setErr((x as Error).message); }
    setSaving(false);
  }
  async function delImg() {
    try { await api(`/admin/lab-services/${form!.id}/image`, { method: 'DELETE' }); setImg(null); load(); } catch (x) { setErr((x as Error).message); }
  }

  async function toggle(s: Svc) {
    try { await api(`/admin/lab-services/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !s.is_active }) }); load(); }
    catch (x) { setErr((x as Error).message); }
  }

  const edit = (s: Svc) => { setImg(s.image_url); setForm({ id: s.id, category_id: s.category_id, name_ar: s.name_ar, name_en: s.name_en, description_ar: s.description_ar ?? '', description_en: s.description_en ?? '', material: s.material ?? '', price: String(s.price), turnaround_days: s.turnaround_days?.toString() ?? '', notes: s.notes ?? '' }); };
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form!, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('aPrices')}</h1>
        <button disabled={!data?.categories.length} onClick={() => setForm({ ...EMPTY, category_id: data!.categories[0].id })} className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{t('pAdd')}</button>
      </div>
      {err && <p className="text-red-500">{err}</p>}

      <details className="rounded-2xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t('pNewCat')}</summary>
        <form onSubmit={addCat} className="mt-3 flex flex-wrap gap-2">
          <input required className={`${f} sm:w-56`} placeholder={t('pCatAr')} value={cat.ar} onChange={(e) => setCat({ ...cat, ar: e.target.value })} />
          <input required className={`${f} sm:w-56`} placeholder={t('pCatEn')} value={cat.en} onChange={(e) => setCat({ ...cat, en: e.target.value })} dir="ltr" />
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-surface">{t('pAddCat')}</button>
        </form>
      </details>

      {data && <CategoryManager base="/admin/lab-services/categories" categories={data.categories as never} onChanged={load} />}

      {!data && !err && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />)}</div>}
      {data && data.categories.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('pNoCats')}</p>}
      {data && data.services.length === 0 && data.categories.length > 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('aNone')}</p>}
      <ul className="space-y-3">
        {data?.services.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${s.is_active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 text-sm">
              <p className="font-medium">{nm(s)} <span className="text-muted">— {catName(s.category_id)}</span></p>
              <p className="text-muted" dir="ltr">{money(s.price, lang)}{s.turnaround_days != null ? ` · ${s.turnaround_days}d` : ''}</p>
            </div>
            <div className="flex gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${s.is_active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}>{s.is_active ? t('pActive') : t('pInactive')}</span>
              <button onClick={() => edit(s)} className="rounded-lg border px-3 py-1 text-sm hover:bg-surface">{t('pEditBtn')}</button>
              <button onClick={() => toggle(s)} className="rounded-lg border px-3 py-1 text-sm hover:bg-surface">{s.is_active ? t('pDeactivate') : t('pActivate')}</button>
            </div>
          </li>
        ))}
      </ul>

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl border bg-bg p-6">
            <h2 className="text-lg font-semibold">{form.id ? t('pEdit') : t('pAdd')}</h2>
            <label className="block text-sm">{t('pCat')}
              <select required className={f} value={form.category_id} onChange={set('category_id')}>{data!.categories.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}</select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">{t('pNameAr')}<input required className={f} value={form.name_ar} onChange={set('name_ar')} /></label>
              <label className="text-sm">{t('pNameEn')}<input required dir="ltr" className={f} value={form.name_en} onChange={set('name_en')} /></label>
              <label className="text-sm">{t('pPrice')}<input required type="number" min="0" step="0.01" dir="ltr" className={f} value={form.price} onChange={set('price')} /></label>
              <label className="text-sm">{t('pDays')}<input type="number" min="0" max="365" dir="ltr" className={f} value={form.turnaround_days} onChange={set('turnaround_days')} /></label>
            </div>
            <label className="block text-sm">{t('pMaterial')}<input className={f} value={form.material} onChange={set('material')} /></label>
            <label className="block text-sm">{t('pDescAr')}<textarea rows={2} className={f} value={form.description_ar} onChange={set('description_ar')} /></label>
            <label className="block text-sm">{t('pDescEn')}<textarea rows={2} dir="ltr" className={f} value={form.description_en} onChange={set('description_en')} /></label>
            <label className="block text-sm">{t('pNotes')}<textarea rows={2} className={f} value={form.notes} onChange={set('notes')} /></label>
            {form.id && (
              <div className="space-y-2 rounded-2xl border p-3">
                <p className="text-sm font-medium">{t('pImage')}</p>
                {img && <div className="flex items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt="" className="h-20 w-20 rounded-xl object-cover" /><button type="button" onClick={delImg} className="text-sm text-red-500">{t('prDel')}</button></div>}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} className="block text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                <p className="text-xs text-muted">{t('prUpload')}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border px-4 py-2 text-sm">{t('pCancel')}</button>
              <button disabled={saving} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '…' : t('pSave')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
