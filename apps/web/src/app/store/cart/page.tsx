'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { useCart } from '@/lib/cart';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

export default function CartPage() {
  const { t, lang } = usePrefs();
  const { cart, setQty, remove } = useCart();
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<void>) => { setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } };
  const step = 'grid h-8 w-8 place-items-center rounded-lg border hover:bg-surface disabled:opacity-40';

  if (cart.items.length === 0)
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-16 text-center">
        <p className="text-xl">{t('stCartEmpty')}</p>
        <Link href="/store" className="inline-block rounded-full bg-navy-900 px-6 py-2.5 font-medium text-white">{t('stContinue')}</Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
      <h1 className="text-3xl font-semibold">{t('stCart')}</h1>
      {err && <p className="text-red-500">{err}</p>}
      <ul className="divide-y rounded-2xl border">
        {cart.items.map((i) => (
          <li key={i.product_id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface">
              {i.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={i.image} alt="" className="h-full w-full object-cover" /> : <Logo size={32} fill="var(--line)" />}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <Link href={`/store/${i.product_id}`} className="font-medium">{lang === 'ar' ? i.name_ar : i.name_en}</Link>
              <p className="text-muted" dir="ltr">{money(i.unit_price, lang)}</p>
              {i.issue && <p className="text-red-500">{i.issue === 'stock' ? `${t('stIssue')} (${i.stock_quantity})` : t('stUnavail')}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button className={step} disabled={i.quantity <= i.min_order_qty} onClick={() => run(() => setQty(i.product_id, i.quantity - 1))} aria-label="-">−</button>
              <span className="w-8 text-center" dir="ltr">{i.quantity}</span>
              <button className={step} disabled={i.quantity >= i.stock_quantity} onClick={() => run(() => setQty(i.product_id, i.quantity + 1))} aria-label="+">+</button>
            </div>
            <p className="w-28 text-end font-medium" dir="ltr">{money(i.line_total, lang)}</p>
            <button onClick={() => run(() => remove(i.product_id))} className="text-sm text-muted hover:text-red-500">{t('stRemove')}</button>
          </li>
        ))}
      </ul>
      <div className="space-y-2 rounded-2xl border bg-surface p-5">
        <div className="flex justify-between text-lg"><span>{t('stSubtotal')}</span><b dir="ltr">{money(cart.subtotal, lang)}</b></div>
        <p className="text-sm text-muted">{t('stFeeNote')}</p>
        <Link href="/store/checkout" className="mt-2 block w-full rounded-xl bg-navy-900 py-3 text-center font-medium text-white">{t('stCheckout')}</Link>
      </div>
      <Link href="/store" className="text-sm text-cyan-accent">← {t('stContinue')}</Link>
    </main>
  );
}
