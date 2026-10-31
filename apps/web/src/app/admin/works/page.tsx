'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type Work = { id: string; title_ar: string; title_en: string; description_ar: string | null; description_en: string | null; is_published: boolean; sort_order: number; images: { id: string; url: string }[] };
type Form = { id?: string; title_ar: string; title_en: string; description_ar: string; description_en: string; is_published: boolean; sort_order: string };
const EMPTY: Form = { title_ar: '', title_en: '', description_ar: '', description_en: '', is_published: true, sort_order: '0' };

export default function AdminWorks() {
  const { t, lang } = usePrefs();
  const MAX = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 5;
  const [list, setList] = useState<Work[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [images, setImages] = useState<Work['images']>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Work[]>('/admin/works').then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form!, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const edit = (w: Work) => { setImages(w.images); setForm({ id: w.id, title_ar: w.title_ar, title_en: w.title_en, description_ar: w.description_ar ?? '', description_en: w.description_en ?? '', is_published: w.is_published, sort_order: String(w.sort_order) }); };

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return;
    setBusy(true); setErr('');
    const body = { title_ar: form.title_ar.trim(), title_en: form.title_en.trim(), description_ar: form.description_ar.trim() || null, description_en: form.description_en.trim() || null, is_published: form.is_published, sort_order: Number(form.sort_order) || 0 };
    try {
      const w = await api<Work>(form.id ? `/admin/works/${form.id}` : '/admin/works', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (!form.id) { setImages(w.images); setForm({ ...form, id: w.id }); } else setForm(null);   // a new work stays open so you can add its photos
      load();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  async function upload(files: FileList) {
    setBusy(true); setErr('');
    for (const f of Array.from(files)) {
      if (f.size > MAX * 1048576) { setErr(`${f.name}: ${t('fiTooBig').replace('{n}', String(MAX))}`); break; }
      try { const fd = new FormData(); fd.append('file', f); const w = await api<Work>(`/admin/works/${form!.id}/images`, { method: 'POST', body: fd }); setImages(w.images); }
      catch (x) { setErr(`${f.name}: ${(x as Error).message}`); break; }
    }
    load(); setBusy(false);
  }
  async function delImg(id: string) { try { const w = await api<Work>(`/admin/works/images/${id}`, { method: 'DELETE' }); setImages(w.images); load(); } catch (x) { setErr((x as Error).message); } }
  async function remove(w: Work) { if (!confirm(t('wkConfirmDel'))) return; try { await api(`/admin/works/${w.id}`, { method: 'DELETE' }); load(); } catch (x) { setErr((x as Error).message); } }
  async function toggle(w: Work) { try { await api(`/admin/works/${w.id}`, { method: 'PATCH', body: JSON.stringify({ is_published: !w.is_published }) }); load(); } catch (x) { setErr((x as Error).message); } }

  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('aWorks')}</h1>
        <button onClick={() => { setImages([]); setForm(EMPTY); }} className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('wkAdd')}</button>
      </div>
      {err && <p role="alert" className="text-red-500">{err}</p>}
      {!list && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {list?.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('aNone')}</p>}
      <ul className="space-y-3">
        {list?.map((w) => (
          <li key={w.id} className={`flex flex-wrap items-center gap-4 rounded-2xl border p-3 ${w.is_published ? '' : 'opacity-60'}`}>
            <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface text-[10px] text-muted">{w.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.images[0].url} alt="" className="h-full w-full object-cover" /> : t('prNoImg')}</div>
            <div className="min-w-0 flex-1 text-sm"><p className="font-medium">{lang === 'ar' ? w.title_ar : w.title_en}</p><p className="text-muted">{w.images.length} {t('worksPhotos')} · {w.is_published ? t('wkPublished') : t('wkHidden')}</p></div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={() => edit(w)} className="rounded-lg border px-3 py-1 hover:bg-surface">{t('pEditBtn')}</button>
              <button onClick={() => toggle(w)} className="rounded-lg border px-3 py-1 hover:bg-surface">{w.is_published ? t('pDeactivate') : t('pActivate')}</button>
              <button onClick={() => remove(w)} className="rounded-lg border px-3 py-1 text-red-500 hover:bg-surface">{t('ctDelete')}</button>
            </div>
          </li>
        ))}
      </ul>

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-3xl border bg-bg p-6">
            <h2 className="text-lg font-semibold">{form.id ? t('wkEdit') : t('wkAdd')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">{t('wkTitleAr')}<input required maxLength={120} className={f} value={form.title_ar} onChange={set('title_ar')} /></label>
              <label className="text-sm">{t('wkTitleEn')}<input required dir="ltr" maxLength={120} className={f} value={form.title_en} onChange={set('title_en')} /></label>
            </div>
            <label className="block text-sm">{t('wkDescAr')}<textarea rows={3} maxLength={2000} className={f} value={form.description_ar} onChange={set('description_ar')} /></label>
            <label className="block text-sm">{t('wkDescEn')}<textarea rows={3} dir="ltr" maxLength={2000} className={f} value={form.description_en} onChange={set('description_en')} /></label>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_published} onChange={set('is_published')} />{t('wkPublished')}</label>
              <label className="flex items-center gap-2">{t('wkOrder')}<input type="number" min={0} dir="ltr" className={`${f} w-24`} value={form.sort_order} onChange={set('sort_order')} /></label>
            </div>
            {form.id && (
              <div className="space-y-2 rounded-2xl border p-3">
                <p className="text-sm font-medium">{t('wkImages')}</p>
                <div className="flex flex-wrap gap-2">{images.map((i) => (
                  <div key={i.id} className="relative h-20 w-24 overflow-hidden rounded-lg border">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={i.url} alt="" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => delImg(i.id)} aria-label={t('prDel')} className="absolute end-0 top-0 grid h-5 w-5 place-items-center bg-black/70 text-xs text-white">×</button></div>
                ))}</div>
                <label className="block text-xs text-muted">{busy ? t('fiUploading') : t('wkUpload')}<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-1 block text-sm" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} /></label>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border px-4 py-2 text-sm">{form.id ? t('wkDone') : t('pCancel')}</button>
              <button disabled={busy} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? '…' : t('pSave')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
