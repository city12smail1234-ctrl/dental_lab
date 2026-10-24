'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type S = { id: string; full_name: string | null; email: string | null; roles: string[] };
const ROLES = ['lab_manager', 'technician', 'order_manager', 'delivery_coordinator', 'delivery_staff', 'accountant', 'inventory_manager'];

export default function Staff() {
  const { t } = usePrefs();
  const [list, setList] = useState<S[] | null>(null);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES[1]);

  const load = useCallback(() => api<S[]>('/admin/staff').then(setList).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { setList(await api<S[]>('/admin/staff', { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) })); setEmail(''); } catch (x) { setErr((x as Error).message); }
  }
  async function remove(id: string, r: string) {
    if (!confirm(t('aSure'))) return;
    try { setList(await api<S[]>(`/admin/staff/${id}/${r}`, { method: 'DELETE' })); } catch (x) { setErr((x as Error).message); }
  }
  const f = 'rounded-xl border px-3 py-2 text-sm';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('sfTitle')}</h1>
      <form onSubmit={add} className="space-y-3 rounded-2xl border p-4">
        <div className="flex flex-wrap gap-2">
          <input required type="email" dir="ltr" placeholder={t('sfEmail')} className={`${f} min-w-0 flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className={`${f} bg-surface`} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('sfRole')}>{ROLES.map((r) => <option key={r} value={r}>{t(`rl_${r}`)}</option>)}</select>
          <button className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white">{t('sfAdd')}</button>
        </div>
        <p className="text-xs text-muted">{t('sfNote')}</p>
      </form>
      {err && <p role="alert" className="text-red-500">{err}</p>}
      {!list && !err && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      <ul className="space-y-3">
        {list?.map((s) => (
          <li key={s.id} className="rounded-2xl border p-4 text-sm">
            <p className="font-medium">{s.full_name ?? '—'} <span className="text-muted" dir="ltr">{s.email}</span></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.roles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                  {t(`rl_${r}`)}{r !== 'super_admin' && <button onClick={() => remove(s.id, r)} aria-label={t('sfRemove')} className="text-red-500">×</button>}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
