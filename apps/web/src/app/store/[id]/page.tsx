'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Prod = { id: string; sku: string; name_ar: string; name_en: string; description_ar: string | null; description_en: string | null; brand: string | null; price: number; discount_price: number | null; stock_quantity: number; min_order_qty: number; images: { id: string; url: string }[] };

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = usePrefs();
  const { setQty, cart } = useCart();
  const [p, setP] = useState<Prod | null | undefined>(undefined);
  const [qty, setQ] = useState(1);
  const [img, setImg] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Prod>(`/products/${id}`).then((x) => { setP(x); setQ(x.min_order_qty); }).catch(() => setP(null));
  }, [id]);

  if (p === undefined) return <div className="mx-auto max-w-5xl p-6"><div className="aspect-video animate-pulse rounded-2xl bg-surface" /></div>;
  if (p === null) return <p className="p-10 text-center text-muted">{t('stNotFound')}</p>;

  const inCart = cart.items.find((i) => i.product_id === p.id)?.quantity ?? 0;
  const out = p.stock_quantity === 0;
  async function add() {
    try { await setQty(p!.id, inCart + qty); setMsg({ ok: true, text: t('stAdded') }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  const step = 'grid h-9 w-9 place-items-center rounded-lg border text-lg hover:bg-surface disabled:opacity-40';

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-5 py-8 md:grid-cols-2">
      <div className="space-y-3">
        <div className="grid aspect-square place-items-center overflow-hidden rounded-3xl border bg-surface">
          {p.images[img] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.images[img].url} alt={lang === 'ar' ? p.name_ar : p.name_en} className="h-full w-full object-cover" /> : <Logo size={96} fill="var(--line)" />}
        </div>
        {p.images.length > 1 && (
          <div className="flex gap-2">
            {p.images.map((i, k) => (
              <button key={i.id} onClick={() => setImg(k)} className={`h-16 w-16 overflow-hidden rounded-xl border ${k === img ? 'ring-2 ring-cyan-accent' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}<img src={i.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Link href="/store" className="text-sm text-cyan-accent">← {t('stTitle')}</Link>
        <h1 className="text-3xl font-semibold">{lang === 'ar' ? p.name_ar : p.name_en}</h1>
        <p className="text-sm text-muted">{[p.brand && `${t('stBrand')}: ${p.brand}`, `${t('stCode')}: ${p.sku}`].filter(Boolean).join(' · ')}</p>
        <p className="text-3xl" dir="ltr">
          {p.discount_price != null ? <><b>{money(p.discount_price, lang)}</b> <s className="text-lg text-muted">{money(p.price, lang)}</s></> : <b>{money(p.price, lang)}</b>}
        </p>
        <p className={out ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}>{out ? t('stOutStock') : `${t('stInStock')} — ${t('stLeft')}: ${p.stock_quantity}`}</p>
        {p.min_order_qty > 1 && <p className="text-sm text-muted">{t('stMin')}: {p.min_order_qty}</p>}
        <p className="leading-8 text-muted">{(lang === 'ar' ? p.description_ar : p.description_en) ?? ''}</p>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2" role="group" aria-label={t('stQty')}>
            <button className={step} disabled={qty <= p.min_order_qty} onClick={() => setQ(qty - 1)} aria-label="-">−</button>
            <span className="w-10 text-center" dir="ltr">{qty}</span>
            <button className={step} disabled={qty + inCart >= p.stock_quantity} onClick={() => setQ(qty + 1)} aria-label="+">+</button>
          </div>
          <button disabled={out || inCart + qty > p.stock_quantity} onClick={add} className="flex-1 rounded-xl bg-navy-900 py-3 font-medium text-white disabled:opacity-40">{t('stAdd')}</button>
        </div>
        {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{msg.text} {msg.ok && <Link href="/store/cart" className="text-cyan-accent underline">{t('stCart')}</Link>}</p>}
      </div>
    </main>
  );
}
