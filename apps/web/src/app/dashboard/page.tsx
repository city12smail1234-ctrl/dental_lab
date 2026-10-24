'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CaseBadge, StatusBadge } from '@/components/Badges';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePolling } from '@/lib/poll';
import { itemsSummary } from '@/lib/summary';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

type Me = { email?: string; roles: string[] };
type Doc = { full_name: string | null; phone: string | null; clinic_name: string | null; clinic_address: string | null; status: string; profileComplete: boolean };
type Case = { id: string; case_number: string; service_name_ar: string; service_name_en: string; status: string };
type Ord = { id: string; order_number: string; status: string; total: number; order_items: { name_ar: string; name_en: string; quantity: number }[] };

export default function Dashboard() {
  const router = useRouter();
  const { t, lang } = usePrefs();
  const [me, setMe] = useState<Me | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [orders, setOrders] = useState<Ord[]>([]);
  const [bal, setBal] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', clinic_name: '', clinic_address: '' });

  async function load() {
    const { data } = await supabase().auth.getSession();
    if (!data.session) return router.replace('/login');
    try {
      const [m, d] = await Promise.all([api<Me>('/auth/me'), api<Doc>('/doctors/me')]);
      setMe(m); setDoc(d);
      setForm((f) => (f.full_name || f.phone ? f : { full_name: d.full_name ?? '', phone: d.phone ?? '', clinic_name: d.clinic_name ?? '', clinic_address: d.clinic_address ?? '' }));
    } catch (e) { setErr((e as Error).message); }
  }
  const refreshLists = () => {
    api<Case[]>('/lab-cases').then((x) => setCases(x.slice(0, 3))).catch(() => {});
    api<Ord[]>('/orders').then((x) => setOrders(x.slice(0, 3))).catch(() => {});
    api<{ summary: { balance: number } }>('/account').then((x) => setBal(Number(x.summary.balance))).catch(() => {});
  };
  useEffect(() => { load(); refreshLists(); /* eslint-disable-next-line */ }, []);
  usePolling(refreshLists);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr(''); setOk(false);
    try { setDoc(await api<Doc>('/doctors/me', { method: 'PATCH', body: JSON.stringify({ ...form, clinic_address: form.clinic_address || undefined }) })); setOk(true); }
    catch (x) { setErr((x as Error).message); }
    setSaving(false);
  }

  if (!me || !doc) return <main className="mx-auto max-w-4xl p-6">{err ? <p className="text-red-500">{err}</p> : <div className="h-48 animate-pulse rounded-2xl bg-surface" />}</main>;
  const isStaff = me.roles.some((r) => r !== 'doctor');
  const f = 'w-full rounded-xl border px-3 py-2.5 text-sm';
  const tile = 'rounded-2xl border p-5 transition-colors hover:bg-surface';
  const name = (c: Case) => (lang === 'ar' ? c.service_name_ar : c.service_name_en);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t('dbWelcome')} {doc.full_name ?? me.email}</h1>
        <div className="flex items-center gap-3">
          {isStaff && <Link href="/admin" className="rounded-full bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('dbAdmin')}</Link>}
          <button onClick={async () => { await supabase().auth.signOut(); router.push('/login'); }} className="text-sm text-muted hover:text-fg">{t('dbLogout')}</button>
        </div>
      </header>

      <p className={`rounded-xl p-4 text-sm ${doc.status === 'approved' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>{t(`ds_${doc.status}`)}</p>
      {err && <p className="text-red-500">{err}</p>}

      {bal !== null && (
        <Link href="/account" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 transition-colors hover:opacity-90 ${bal > 0 ? 'bg-amber-500/10' : bal < 0 ? 'bg-emerald-500/10' : 'bg-surface'}`}>
          <span className="text-sm text-muted">{bal > 0 ? t('acctOwe') : bal < 0 ? t('acctCredit') : t('acctSettled')}</span>
          <b className="text-2xl" dir="ltr">{money(Math.abs(bal), lang)}</b>
        </Link>
      )}
      <section>
        <h2 className="mb-3 font-semibold">{t('dbQuick')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Link href="/cases/new" className={`${tile} bg-navy-900 text-white hover:opacity-90`}>{t('dbNewCase')}</Link>
          <Link href="/store" className={tile}>{t('dbStore')}</Link>
          <Link href="/services" className={tile}>{t('dbPrices')}</Link>
          <Link href="/cases" className={tile}>{t('csTitle')}</Link>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t('dbRecentCases')}</h2><Link href="/cases" className="text-sm text-cyan-accent">{t('dbAll')}</Link></div>
          {cases.length === 0 && <p className="text-sm text-muted">{t('csNone')}</p>}
          <ul className="divide-y">{cases.map((c) => (
            <li key={c.id}><Link href={`/cases/${c.id}`} className="flex items-center justify-between gap-2 py-3 text-sm"><span><b>{name(c)}</b><span className="block text-muted" dir="ltr">{c.case_number}</span></span><CaseBadge s={c.status} /></Link></li>
          ))}</ul>
        </section>
        <section className="rounded-2xl border p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t('dbRecentOrders')}</h2><Link href="/store/orders" className="text-sm text-cyan-accent">{t('dbAll')}</Link></div>
          {orders.length === 0 && <p className="text-sm text-muted">{t('orNone')}</p>}
          <ul className="divide-y">{orders.map((o) => (
            <li key={o.id}><Link href={`/store/orders/${o.id}`} className="flex items-center justify-between gap-2 py-3 text-sm"><span><b>{itemsSummary(o.order_items, lang) || o.order_number}</b><span className="block text-muted" dir="ltr">{o.order_number} · {money(o.total, lang)}</span></span><StatusBadge s={o.status} /></Link></li>
          ))}</ul>
        </section>
      </div>

      <details open={!doc.profileComplete} className="rounded-2xl border p-5">
        <summary className="cursor-pointer font-semibold">{doc.profileComplete ? t('dbProfile') : t('dbComplete')}</summary>
        <form onSubmit={save} className="mt-4 space-y-3">
          <input required className={f} placeholder={t('fullName')} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input required dir="ltr" className={f} placeholder={t('ckPhone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input required className={f} placeholder={t('dbClinic')} value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} />
          <input className={f} placeholder={t('dbClinicAddr')} value={form.clinic_address} onChange={(e) => setForm({ ...form, clinic_address: e.target.value })} />
          {ok && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{t('dbSaved')}</p>}
          <button disabled={saving} className="rounded-xl bg-navy-900 px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '…' : t('pSave')}</button>
        </form>
      </details>
    </main>
  );
}
