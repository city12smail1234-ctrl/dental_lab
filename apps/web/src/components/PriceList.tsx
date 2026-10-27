'use client';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { Logo } from './Logo';

type Cat = { id: string; name_ar: string; name_en: string };
type Svc = { id: string; category_id: string; name_ar: string; name_en: string; description_ar: string | null; description_en: string | null; material: string | null; price: number; turnaround_days: number | null; image_url: string | null };

/** The lab's real price list, shown to everyone on the landing page. */
export function PriceList() {
  const { t, lang } = usePrefs();
  const [data, setData] = useState<{ categories: Cat[]; services: Svc[] } | null | 'error'>(null);
  const [cat, setCat] = useState('');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/price-list`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setData('error'));
  }, []);

  const nm = (o: { name_ar: string; name_en: string }) => (lang === 'ar' ? o.name_ar : o.name_en);
  const list = useMemo(() => (data && data !== 'error' ? data.services.filter((s) => !cat || s.category_id === cat) : []), [data, cat]);
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm transition-colors ${on ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`;

  if (data === null) return <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />)}</div>;
  if (data === 'error' || data.services.length === 0)
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <p className="text-muted">{t('priceEmpty')}</p>
        <Link href="/register" className="mt-4 inline-block rounded-full bg-navy-900 px-6 py-2.5 font-medium text-white">{t('cta1')}</Link>
      </div>
    );

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist">
        <button role="tab" aria-selected={!cat} className={chip(!cat)} onClick={() => setCat('')}>{t('priceAll')}</button>
        {data.categories.filter((c) => data.services.some((s) => s.category_id === c.id)).map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={chip(cat === c.id)} onClick={() => setCat(c.id)}>{nm(c)}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.ul key={cat} initial="hidden" animate="show" exit={{ opacity: 0 }} variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="mt-6 grid gap-4 md:grid-cols-2">
          {list.map((s) => (
            <motion.li key={s.id} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group flex items-center gap-4 rounded-2xl border p-4 transition-colors hover:border-cyan-accent hover:bg-surface">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface">
                {s.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.image_url} alt="" className="h-full w-full object-cover" /> : <Logo size={30} fill="var(--line)" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">{nm(s)}</h3>
                <p className="line-clamp-2 text-sm text-muted">{(lang === 'ar' ? s.description_ar : s.description_en) ?? ''}</p>
                {(s.material || s.turnaround_days != null) && (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    {s.material && <span>{s.material}</span>}
                    {s.turnaround_days != null && <span>{s.turnaround_days} {t('priceDays')}</span>}
                  </p>
                )}
              </div>
              <div className="shrink-0 rounded-xl bg-cyan-accent/10 px-3 py-2 text-center font-semibold text-navy-900" dir="ltr">{money(s.price, lang)}</div>
            </motion.li>
          ))}
        </motion.ul>
      </AnimatePresence>

      <p className="mt-5 text-sm text-muted">{t('priceNote')}</p>
    </div>
  );
}
