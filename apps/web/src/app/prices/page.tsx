'use client';
import Link from 'next/link';
import { motion } from 'motion/react';
import { PriceList } from '@/components/PriceList';
import { usePrefs } from '@/lib/prefs';

// Public page: anyone with the link can see the price list, no account needed.
export default function PricesPage() {
  const { t } = usePrefs();
  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-3xl font-semibold md:text-4xl">{t('priceT')}</h1>
        <p className="mt-2 text-muted">{t('priceSub')}</p>
      </motion.div>
      <div className="mt-10"><PriceList /></div>
      <div className="mt-14 rounded-3xl border bg-surface p-8 text-center">
        <p className="text-lg font-medium">{t('ctaT')}</p>
        <p className="mx-auto mt-1 max-w-md text-muted">{t('ctaD')}</p>
        <Link href="/register" className="mt-5 inline-block rounded-full bg-navy-900 px-7 py-3 font-medium text-white">{t('cta1')}</Link>
      </div>
    </main>
  );
}
