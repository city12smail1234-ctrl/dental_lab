'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PayBadge, StatusBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { Countdown, isOpenStatus } from '@/components/Countdown';
import { itemsSummary } from '@/lib/summary';
import { usePrefs } from '@/lib/prefs';

type O = { id: string; order_number: string; status: string; payment_method: string; payment_status: string; total: number; created_at: string; due_at: string | null; order_items: { name_ar: string; name_en: string; quantity: number }[] };

export default function MyOrders() {
  const { t, lang } = usePrefs();
  const [list, setList] = useState<O[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<O[]>('/orders').then(setList).catch((e) => setErr(e.message)); }, []);
  const date = (x: string) => new Date(x).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-5 py-8">
      <h1 className="text-3xl font-semibold">{t('orMy')}</h1>
      {err && <p className="text-red-500">{err}</p>}
      {!list && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {list?.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('orNone')}</p>}
      <ul className="space-y-3">
        {list?.map((o) => (
          <li key={o.id}>
            <Link href={`/store/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-surface">
              <div className="min-w-0 text-sm"><p className="font-semibold">{itemsSummary(o.order_items, lang) || o.order_number}</p><p className="text-muted"><span dir="ltr">{o.order_number}</span> · {date(o.created_at)} · {t(`pm_${o.payment_method}`)}</p>{o.due_at && isOpenStatus(o.status) && <div className="mt-1"><Countdown due={o.due_at} /></div>}</div>
              <div className="flex items-center gap-2"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /><b dir="ltr">{money(o.total, lang)}</b></div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
