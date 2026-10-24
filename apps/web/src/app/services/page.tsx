'use client';
import { usePolling } from '@/lib/poll';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

type Cat = { id: string; name_ar: string; name_en: string };
type Svc = { id: string; category_id: string; name_ar: string; name_en: string; description_ar: string | null; description_en: string | null; material: string | null; image_url: string | null; price: number; turnaround_days: number | null };

export default function Services() {
  const router = useRouter();
  const { t, lang } = usePrefs();
  const [data, setData] = useState<{ categories: Cat[]; services: Svc[] } | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('name');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase().auth.getSession();
      if (!s.session) return router.replace('/login');
      try { setData(await api('/lab-services')); } catch (e) { setErr((e as Error).message); }
    })();
  }, [router]);

  usePolling(() => { api<{ categories: Cat[]; services: Svc[] }>('/lab-services').then(setData).catch(() => {}); });
  const nm = (o: { name_ar: string; name_en: string }) => (lang === 'ar' ? o.name_ar : o.name_en);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const l = (data?.services ?? []).filter((s) => (!cat || s.category_id === cat) && (!k || `${s.name_ar} ${s.name_en}`.toLowerCase().includes(k)));
    return l.sort((a, b) => (sort === 'asc' ? a.price - b.price : sort === 'desc' ? b.price - a.price : nm(a).localeCompare(nm(b))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, cat, sort, lang]);

  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm ${on ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`;
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <Link href="/dashboard" className="text-sm text-cyan-accent">{t('svBack')}</Link>
      <div><h1 className="text-3xl font-semibold">{t('svTitle')}</h1><p className="text-muted">{t('svSub')}</p></div>
      {err && <p className="text-red-500">{err}</p>}
      {!data && !err && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />)}</div>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button className={chip(!cat)} onClick={() => setCat('')}>{t('svAll')}</button>
            {data.categories.map((c) => <button key={c.id} className={chip(cat === c.id)} onClick={() => setCat(c.id)}>{nm(c)}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('svSearch')} className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm" />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('svSort')} className="rounded-full border bg-surface px-4 py-2 text-sm">
              <option value="name">{t('svName')}</option><option value="asc">{t('svPriceAsc')}</option><option value="desc">{t('svPriceDesc')}</option>
            </select>
          </div>
          {shown.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('svEmpty')}</p>}
          <ul className="border-t">
            {shown.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-4 border-b px-2 py-5">
                {s.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-medium">{nm(s)}</h2>
                  <p className="mt-1 text-sm text-muted">{(lang === 'ar' ? s.description_ar : s.description_en) ?? ''}</p>
                  <p className="mt-1 text-xs text-muted">{[s.material, s.turnaround_days != null ? `${s.turnaround_days} ${t('svDays')}` : null].filter(Boolean).join(' · ')}</p>
                </div>
                <p className="shrink-0 text-lg font-semibold" dir="ltr">{money(s.price, lang)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
