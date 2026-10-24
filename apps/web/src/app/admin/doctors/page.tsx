'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type Item = { user_id: string; status: string; clinic_name: string | null; profiles: { full_name: string | null; email: string | null; phone: string | null } | null };
const TABS = ['pending', 'approved', 'suspended', 'rejected'];
const ACTIONS: Record<string, [string, string][]> = {
  pending: [['approved', 'ac_approved'], ['rejected', 'ac_rejected']],
  approved: [['suspended', 'ac_suspended']],
  suspended: [['approved', 'ac_reactivate']],
  rejected: [['approved', 'ac_approved']],
};

export default function AdminDoctors() {
  const { t } = usePrefs();
  const [tab, setTab] = useState('pending');
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setItems(null); setErr('');
    try { setItems((await api<{ items: Item[] }>(`/admin/doctors?status=${tab}`)).items); }
    catch (e) { setErr((e as Error).message); setItems([]); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (items ?? []).filter((d) => !k || [d.profiles?.full_name, d.profiles?.email, d.clinic_name].some((v) => v?.toLowerCase().includes(k)));
  }, [items, q]);

  async function change(id: string, status: string) {
    if (!confirm(t('aSure'))) return;
    try { await api(`/admin/doctors/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('aDoctors')}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm transition-colors ${tab === k ? 'bg-navy-900 text-white' : 'border hover:bg-surface'}`}>{t(`st_${k}`)}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('aSearch')} className="ms-auto w-full rounded-full border px-4 py-1.5 text-sm sm:w-64" />
      </div>
      {err && <p className="text-red-500">{err}</p>}
      {items === null && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />)}</div>}
      {items && shown.length === 0 && !err && <p className="rounded-xl border border-dashed p-8 text-center text-muted">{t('aNone')}</p>}
      <ul className="space-y-3">
        {shown.map((d) => (
          <li key={d.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0 text-sm">
              <p className="font-medium">{d.profiles?.full_name ?? t('aNoName')} <span className="text-muted">— {d.clinic_name ?? t('aNoClinic')}</span></p>
              <p className="text-muted" dir="ltr">{d.profiles?.email} · {d.profiles?.phone ?? '—'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/accounts/${d.user_id}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-surface">{t('aAccounts')}</Link>
              {ACTIONS[d.status]?.map(([s, label]) => (
                <button key={s} onClick={() => change(d.user_id, s)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-surface">{t(label)}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
