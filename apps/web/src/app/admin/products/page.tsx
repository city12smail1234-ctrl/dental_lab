'use client';
import { CategoryManager } from '@/components/CategoryManager';
import { usePolling } from '@/lib/poll';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Cat = { id: string; name_ar: string; name_en: string; sort_order: number; is_active: boolean };
type Img = { id: string; url: string; is_primary: boolean };
type Prod = { id: string; sku: string; category_id: string; name_ar: string; name_en: string; description_ar: string | null; description_en: string | null; brand: string | null; price: number; discount_price: number | null; stock_quantity: number; min_order_qty: number; low_stock_threshold: number; is_active: boolean; is_featured: boolean; images: Img[] };
type Form = { id?: string; sku: string; category_id: string; name_ar: string; name_en: string; description_ar: string; description_en: string; brand: string; price: string; discount_price: string; min_order_qty: string; low_stock_threshold: string; is_featured: boolean; initial_stock: string };
const EMPTY: Form = { sku: '', category_id: '', name_ar: '', name_en: '', description_ar: '', description_en: '', brand: '', price: '', discount_price: '', min_order_qty: '1', low_stock_threshold: '5', is_featured: false, initial_stock: '0' };
const nul = (v: string) => (v.trim() ? v.trim() : null);
const REASONS = ['purchase', 'adjustment', 'return', 'damage'];

export default function Products() {
  const { t, lang } = usePrefs();
  const [cats, setCats] = useState<Cat[]>([]);
  const [res, setRes] = useState<{ items: Prod[]; total: number; limit: number } | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [stock, setStock] = useState<{ p: Prod; delta: string; reason: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState({ ar: '', en: '' });

  const load = useCallback(async () => {
    try { setRes(await api(`/admin/products?page=${page}&search=${encodeURIComponent(q)}`)); setErr(''); } catch (e) { setErr((e as Error).message); }
  }, [page, q]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  usePolling(load);
  useEffect(() => { api<Cat[]>('/admin/product-categories').then(setCats).catch((e) => setErr(e.message)); }, []);

  const nm = (o: { name_ar: string; name_en: string }) => (lang === 'ar' ? o.name_ar : o.name_en);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form!, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/admin/product-categories', { method: 'POST', body: JSON.stringify({ name_ar: cat.ar, name_en: cat.en }) }); setCat({ ar: '', en: '' }); setCats(await api('/admin/product-categories')); }
    catch (x) { setErr((x as Error).message); }
  }

  function openEdit(p: Prod) {
    setImages(p.images);
    setForm({ id: p.id, sku: p.sku, category_id: p.category_id, name_ar: p.name_ar, name_en: p.name_en, description_ar: p.description_ar ?? '', description_en: p.description_en ?? '', brand: p.brand ?? '', price: String(p.price), discount_price: p.discount_price?.toString() ?? '', min_order_qty: String(p.min_order_qty), low_stock_threshold: String(p.low_stock_threshold), is_featured: p.is_featured, initial_stock: '0' });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return;
    setBusy(true); setErr('');
    const body: Record<string, unknown> = {
      sku: form.sku.trim(), category_id: form.category_id, name_ar: form.name_ar.trim(), name_en: form.name_en.trim(),
      description_ar: nul(form.description_ar), description_en: nul(form.description_en), brand: nul(form.brand),
      price: Number(form.price), discount_price: form.discount_price.trim() ? Number(form.discount_price) : null,
      min_order_qty: Number(form.min_order_qty), low_stock_threshold: Number(form.low_stock_threshold), is_featured: form.is_featured,
    };
    if (!form.id) body.initial_stock = Number(form.initial_stock) || 0;
    try {
      await api(form.id ? `/admin/products/${form.id}` : '/admin/products', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setForm(null); load();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  async function toggle(p: Prod) {
    try { await api(`/admin/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !p.is_active }) }); load(); } catch (x) { setErr((x as Error).message); }
  }

  async function upload(file: File) {
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const p = await api<Prod>(`/admin/products/${form!.id}/images`, { method: 'POST', body: fd });
      setImages(p.images); load();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  async function delImg(id: string) {
    try { const p = await api<Prod>(`/admin/products/images/${id}`, { method: 'DELETE' }); setImages(p.images); load(); } catch (x) { setErr((x as Error).message); }
  }

  async function saveStock(e: React.FormEvent) {
    e.preventDefault(); if (!stock) return;
    setBusy(true); setErr('');
    try {
      await api(`/admin/products/${stock.p.id}/stock`, { method: 'POST', body: JSON.stringify({ delta: Number(stock.delta), reason: stock.reason, note: stock.note || undefined }) });
      setStock(null); load();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const btn = 'rounded-lg border px-3 py-1 text-sm hover:bg-surface';
  const pages = res ? Math.max(1, Math.ceil(res.total / res.limit)) : 1;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('aProducts')}</h1>
        <button disabled={!cats.length} onClick={() => { setImages([]); setForm({ ...EMPTY, category_id: cats[0].id }); }} className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{t('prAdd')}</button>
      </div>
      {err && <p className="text-red-500">{err}</p>}

      <details className="rounded-2xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t('pNewCat')}</summary>
        <form onSubmit={addCat} className="mt-3 flex flex-wrap gap-2">
          <input required className={`${f} sm:w-56`} placeholder={t('pCatAr')} value={cat.ar} onChange={(e) => setCat({ ...cat, ar: e.target.value })} />
          <input required dir="ltr" className={`${f} sm:w-56`} placeholder={t('pCatEn')} value={cat.en} onChange={(e) => setCat({ ...cat, en: e.target.value })} />
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-surface">{t('pAddCat')}</button>
        </form>
      </details>

      <CategoryManager base="/admin/product-categories" categories={cats} onChanged={() => api<Cat[]>('/admin/product-categories').then(setCats)} />

      <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder={t('prSearch')} className="w-full rounded-full border px-4 py-2 text-sm sm:w-80" />
      {!res && !err && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />)}</div>}
      {res?.items.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('aNone')}</p>}

      <ul className="space-y-3">
        {res?.items.map((p) => {
          const low = p.stock_quantity <= p.low_stock_threshold;
          return (
            <li key={p.id} className={`flex flex-wrap items-center gap-4 rounded-2xl border p-3 ${p.is_active ? '' : 'opacity-60'}`}>
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface text-[10px] text-muted">
                {p.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.images[0].url} alt="" className="h-full w-full object-cover" /> : t('prNoImg')}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{nm(p)} <span className="text-muted" dir="ltr">· {p.sku}</span></p>
                <p dir="ltr" className="text-muted">
                  {p.discount_price != null ? <><b className="text-fg">{money(p.discount_price, lang)}</b> <s>{money(p.price, lang)}</s></> : money(p.price, lang)}
                </p>
                <p className={low ? 'text-red-500' : 'text-muted'}>{t('prStock')}: {p.stock_quantity}{p.stock_quantity === 0 ? ` — ${t('prOut')}` : low ? ` — ${t('prLowBadge')}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => setStock({ p, delta: '', reason: 'purchase', note: '' })}>{t('prAdjust')}</button>
                <button className={btn} onClick={() => openEdit(p)}>{t('pEditBtn')}</button>
                <button className={btn} onClick={() => toggle(p)}>{p.is_active ? t('pDeactivate') : t('pActivate')}</button>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn} disabled:opacity-40`}>{t('prPrev')}</button>
          <span dir="ltr">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={`${btn} disabled:opacity-40`}>{t('prNext')}</button>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-3xl border bg-bg p-6">
            <h2 className="text-lg font-semibold">{form.id ? t('prEdit') : t('prAdd')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">{t('prSku')}<input required dir="ltr" className={f} value={form.sku} onChange={set('sku')} /></label>
              <label className="text-sm">{t('pCat')}<select required className={f} value={form.category_id} onChange={set('category_id')}>{cats.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}</select></label>
              <label className="text-sm">{t('pNameAr')}<input required className={f} value={form.name_ar} onChange={set('name_ar')} /></label>
              <label className="text-sm">{t('pNameEn')}<input required dir="ltr" className={f} value={form.name_en} onChange={set('name_en')} /></label>
              <label className="text-sm">{t('prPrice')}<input required type="number" min="0" step="0.01" dir="ltr" className={f} value={form.price} onChange={set('price')} /></label>
              <label className="text-sm">{t('prDiscount')}<input type="number" min="0" step="0.01" dir="ltr" className={f} value={form.discount_price} onChange={set('discount_price')} /></label>
              <label className="text-sm">{t('prMinQty')}<input required type="number" min="1" dir="ltr" className={f} value={form.min_order_qty} onChange={set('min_order_qty')} /></label>
              <label className="text-sm">{t('prLow')}<input required type="number" min="0" dir="ltr" className={f} value={form.low_stock_threshold} onChange={set('low_stock_threshold')} /></label>
              <label className="text-sm">{t('prBrand')}<input className={f} value={form.brand} onChange={set('brand')} /></label>
              {!form.id && <label className="text-sm">{t('prInitial')}<input type="number" min="0" dir="ltr" className={f} value={form.initial_stock} onChange={set('initial_stock')} /></label>}
            </div>
            <label className="block text-sm">{t('pDescAr')}<textarea rows={2} className={f} value={form.description_ar} onChange={set('description_ar')} /></label>
            <label className="block text-sm">{t('pDescEn')}<textarea rows={2} dir="ltr" className={f} value={form.description_en} onChange={set('description_en')} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={set('is_featured')} />{t('prFeatured')}</label>

            {form.id && (
              <div className="space-y-2 rounded-2xl border p-3">
                <p className="text-sm font-medium">{t('prImages')}</p>
                <div className="flex flex-wrap gap-2">
                  {images.map((i) => (
                    <div key={i.id} className="relative h-16 w-16 overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.url} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => delImg(i.id)} aria-label={t('prDel')} className="absolute end-0 top-0 grid h-5 w-5 place-items-center bg-black/70 text-xs text-white">×</button>
                    </div>
                  ))}
                </div>
                <label className="block text-xs text-muted">{t('prUpload')}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-1 block text-sm" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} />
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border px-4 py-2 text-sm">{t('pCancel')}</button>
              <button disabled={busy} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? '…' : t('pSave')}</button>
            </div>
          </form>
        </div>
      )}

      {stock && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setStock(null)}>
          <form onSubmit={saveStock} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-3xl border bg-bg p-6">
            <h2 className="text-lg font-semibold">{t('prAdjust')}</h2>
            <p className="text-sm text-muted">{nm(stock.p)} — {t('prStock')}: {stock.p.stock_quantity}</p>
            <label className="block text-sm">{t('prDelta')}<input required type="number" step="1" dir="ltr" className={f} value={stock.delta} onChange={(e) => setStock({ ...stock, delta: e.target.value })} /></label>
            <label className="block text-sm">{t('prReason')}<select className={f} value={stock.reason} onChange={(e) => setStock({ ...stock, reason: e.target.value })}>{REASONS.map((r) => <option key={r} value={r}>{t(`rs_${r}`)}</option>)}</select></label>
            <label className="block text-sm">{t('prNote')}<input className={f} value={stock.note} onChange={(e) => setStock({ ...stock, note: e.target.value })} /></label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setStock(null)} className="rounded-xl border px-4 py-2 text-sm">{t('pCancel')}</button>
              <button disabled={busy} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{t('pSave')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
