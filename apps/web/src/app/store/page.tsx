'use client';
import { usePolling } from '@/lib/poll';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Cat = { id: string; name_ar: string; name_en: string };
type Prod = { id: string; sku: string; name_ar: string; name_en: string; brand: string | null; price: number; discount_price: number | null; stock_quantity: number; min_order_qty: number; images: { url: string }[] };

export default function Store() {
  const { t, lang } = usePrefs();
  const { cart, setQty } = useCart();
  const [cats, setCats] = useState<Cat[]>([]);
  const [res, setRes] = useState<{ items: Prod[]; total: number; limit: number } | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');

  useEffect(() => { api<Cat[]>('/products/categories').then(setCats).catch(() => {}); }, []);
  const load = useCallback(async () => {
    try { setRes(await api(`/products?page=${page}&sort=${sort}&category=${cat}&search=${encodeURIComponent(q)}`)); } catch (e) { setToast((e as Error).message); }
  }, [page, sort, cat, q]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  usePolling(load);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(''), 2500); return () => clearTimeout(h); }, [toast]);

  const nm = (o: { name_ar: string; name_en: string }) => (lang === 'ar' ? o.name_ar : o.name_en);
  async function add(p: Prod) {
    const cur = cart.items.find((i) => i.product_id === p.id)?.quantity ?? 0;
    try { await setQty(p.id, cur ? cur + 1 : p.min_order_qty); setToast(t('stAdded')); } catch (e) { setToast((e as Error).message); }
  }
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm ${on ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`;
  const pages = res ? Math.max(1, Math.ceil(res.total / res.limit)) : 1;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button className={chip(!cat)} onClick={() => { setCat(''); setPage(1); }}>{t('stAll')}</button>
        {cats.map((c) => <button key={c.id} className={chip(cat === c.id)} onClick={() => { setCat(c.id); setPage(1); }}>{nm(c)}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('stSearch')} className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm sm:max-w-sm" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('svSort')} className="rounded-full border bg-surface px-4 py-2 text-sm">
          <option value="newest">{t('stNewest')}</option><option value="price_asc">{t('svPriceAsc')}</option><option value="price_desc">{t('svPriceDesc')}</option>
        </select>
      </div>

      {!res && <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-surface" />)}</div>}
      {res?.items.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('svEmpty')}</p>}

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {res?.items.map((p) => {
          const out = p.stock_quantity === 0;
          return (
            <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl border">
              <Link href={`/store/${p.id}`} className="grid aspect-square place-items-center bg-surface">
                {p.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.images[0].url} alt={nm(p)} className="h-full w-full object-cover" /> : <Logo size={56} fill="var(--line)" />}
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <Link href={`/store/${p.id}`} className="line-clamp-2 text-sm font-medium">{nm(p)}</Link>
                {p.brand && <p className="text-xs text-muted">{p.brand}</p>}
                <p className="mt-auto text-sm" dir="ltr">
                  {p.discount_price != null ? <><b>{money(p.discount_price, lang)}</b> <s className="text-muted">{money(p.price, lang)}</s></> : <b>{money(p.price, lang)}</b>}
                </p>
                <button disabled={out} onClick={() => add(p)} className="mt-2 rounded-xl bg-navy-900 py-2 text-sm font-medium text-white disabled:opacity-40">{out ? t('stOutStock') : t('stAdd')}</button>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t('prPrev')}</button>
          <span dir="ltr">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t('prNext')}</button>
        </div>
      )}
      {toast && <div role="status" className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-full bg-navy-900 px-5 py-2 text-sm text-white shadow-lg rtl:translate-x-1/2">{toast}</div>}
    </main>
  );
}
