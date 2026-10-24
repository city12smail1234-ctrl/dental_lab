'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type S = {
  business: { name: string; phone: string; address: string };
  delivery: { flat_fee: number; free_over: number | null };
  payments: { cod: { enabled: boolean }; account: { enabled: boolean }; vodafone_cash: { enabled: boolean; number: string; name: string }; instapay: { enabled: boolean; handle: string; name: string } };
};

const D: S = {
  business: { name: '', phone: '', address: '' },
  delivery: { flat_fee: 0, free_over: null },
  payments: { cod: { enabled: true }, account: { enabled: false }, vodafone_cash: { enabled: false, number: '', name: '' }, instapay: { enabled: false, handle: '', name: '' } },
};
// Never trust the shape of what came back: fill any gap so the page cannot crash on a missing key.
const norm = (x: Partial<S> | null | undefined): S => ({
  business: { ...D.business, ...x?.business },
  delivery: { ...D.delivery, ...x?.delivery },
  payments: {
    cod: { ...D.payments.cod, ...x?.payments?.cod }, account: { ...D.payments.account, ...x?.payments?.account },
    vodafone_cash: { ...D.payments.vodafone_cash, ...x?.payments?.vodafone_cash }, instapay: { ...D.payments.instapay, ...x?.payments?.instapay },
  },
});

export default function Settings() {
  const { t } = usePrefs();
  const [s, setS] = useState<S | null>(null);
  const [free, setFree] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<S>('/admin/settings').then((raw) => { const x = norm(raw); setS(x); setFree(x.delivery.free_over?.toString() ?? ''); }).catch((e) => setErr(e.message)); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!s) return;
    setBusy(true); setErr(''); setOk(false);
    try { await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ ...s, delivery: { flat_fee: Number(s.delivery.flat_fee), free_over: free.trim() ? Number(free) : null } }) }); setOk(true); }
    catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  if (!s) return err ? <p className="text-red-500">{err}</p> : <div className="h-64 animate-pulse rounded-2xl bg-surface" />;
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const card = 'space-y-3 rounded-2xl border p-5';
  const vc = s.payments.vodafone_cash, ip = s.payments.instapay;

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('seTitle')}</h1>

      <section className={card}>
        <h2 className="font-medium">{t('seBusiness')}</h2>
        <label className="block text-sm">{t('seName')}<input required className={f} value={s.business.name} onChange={(e) => setS({ ...s, business: { ...s.business, name: e.target.value } })} /></label>
        <label className="block text-sm">{t('sePhone')}<input dir="ltr" className={f} value={s.business.phone} onChange={(e) => setS({ ...s, business: { ...s.business, phone: e.target.value } })} /></label>
        <label className="block text-sm">{t('seAddress')}<input className={f} value={s.business.address} onChange={(e) => setS({ ...s, business: { ...s.business, address: e.target.value } })} /></label>
      </section>

      <section className={card}>
        <h2 className="font-medium">{t('seDelivery')}</h2>
        <label className="block text-sm">{t('seFlat')}<input required type="number" min="0" step="0.01" dir="ltr" className={f} value={s.delivery.flat_fee} onChange={(e) => setS({ ...s, delivery: { ...s.delivery, flat_fee: e.target.value as unknown as number } })} /></label>
        <label className="block text-sm">{t('seFreeOver')}<input type="number" min="0" step="0.01" dir="ltr" className={f} value={free} onChange={(e) => setFree(e.target.value)} /></label>
      </section>

      <section className={card}>
        <h2 className="font-medium">{t('sePayments')}</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.payments.cod.enabled} onChange={(e) => setS({ ...s, payments: { ...s.payments, cod: { enabled: e.target.checked } } })} />{t('pm_cod')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.payments.account?.enabled ?? false} onChange={(e) => setS({ ...s, payments: { ...s.payments, account: { enabled: e.target.checked } } })} />{t('pm_account')}</label>

        <div className="space-y-2 rounded-xl border p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={vc.enabled} onChange={(e) => setS({ ...s, payments: { ...s.payments, vodafone_cash: { ...vc, enabled: e.target.checked } } })} />{t('pm_vodafone_cash')}</label>
          <input dir="ltr" className={f} placeholder={t('seVcNumber')} value={vc.number} onChange={(e) => setS({ ...s, payments: { ...s.payments, vodafone_cash: { ...vc, number: e.target.value } } })} />
          <input className={f} placeholder={t('seAccName')} value={vc.name} onChange={(e) => setS({ ...s, payments: { ...s.payments, vodafone_cash: { ...vc, name: e.target.value } } })} />
        </div>

        <div className="space-y-2 rounded-xl border p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={ip.enabled} onChange={(e) => setS({ ...s, payments: { ...s.payments, instapay: { ...ip, enabled: e.target.checked } } })} />{t('pm_instapay')}</label>
          <input dir="ltr" className={f} placeholder={t('seIpHandle')} value={ip.handle} onChange={(e) => setS({ ...s, payments: { ...s.payments, instapay: { ...ip, handle: e.target.value } } })} />
          <input className={f} placeholder={t('seAccName')} value={ip.name} onChange={(e) => setS({ ...s, payments: { ...s.payments, instapay: { ...ip, name: e.target.value } } })} />
        </div>
      </section>

      {err && <p role="alert" className="text-red-500">{err}</p>}
      {ok && <p role="status" className="text-emerald-600 dark:text-emerald-400">{t('seSaved')}</p>}
      <button disabled={busy} className="rounded-xl bg-navy-900 px-6 py-2.5 font-medium text-white disabled:opacity-50">{busy ? '…' : t('pSave')}</button>
    </form>
  );
}
