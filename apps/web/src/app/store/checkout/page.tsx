'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';

type Method = { id: string; number?: string; handle?: string; name?: string };
type Addr = { id: string; label: string | null; address_line: string; phone: string | null };
type Opts = { methods: Method[]; subtotal: number; delivery_fee: number; total: number; addresses: Addr[]; phone: string; default_address: string; approved: boolean; items_count: number; has_issues: boolean };

export default function Checkout() {
  const router = useRouter();
  const { t, lang } = usePrefs();
  const [o, setO] = useState<Opts | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('');
  const [phone, setPhone] = useState('');
  const [addrId, setAddrId] = useState('new');
  const [address, setAddress] = useState('');
  const [save, setSave] = useState(true);
  const [instr, setInstr] = useState('');
  const [notes, setNotes] = useState('');
  const key = useRef(crypto.randomUUID()); // same key on retries => never two orders for one click

  useEffect(() => {
    api<Opts>('/checkout').then((x) => {
      setO(x); setPhone(x.phone); setMethod(x.methods[0]?.id ?? '');
      const first = x.addresses[0];
      if (first) { setAddrId(first.id); setAddress(first.address_line); } else setAddress(x.default_address);
    }).catch((e) => setErr(e.message));
  }, []);

  function pick(id: string) {
    setAddrId(id);
    setAddress(id === 'new' ? '' : o!.addresses.find((a) => a.id === id)?.address_line ?? '');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api<{ id: string }>('/orders', { method: 'POST', body: JSON.stringify({
        payment_method: method, phone, address, delivery_instructions: instr || undefined, notes: notes || undefined,
        idempotency_key: key.current, save_address: addrId === 'new' && save,
      }) });
      router.replace(`/store/orders/${r.id}`);
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  if (!o) return <main className="mx-auto max-w-3xl p-6">{err ? <p className="text-red-500">{err}</p> : <div className="h-64 animate-pulse rounded-2xl bg-surface" />}</main>;
  if (o.items_count === 0) return <main className="mx-auto max-w-3xl space-y-3 p-10 text-center"><p>{t('stCartEmpty')}</p><Link href="/store" className="text-cyan-accent">{t('stContinue')}</Link></main>;

  const f = 'w-full rounded-xl border px-3 py-2.5 text-sm';
  const blocked = !o.approved || o.has_issues || o.methods.length === 0;
  const sel = o.methods.find((m) => m.id === method);

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-5 py-8 md:grid-cols-[1fr_20rem]">
      <form onSubmit={submit} className="space-y-5">
        <h1 className="text-3xl font-semibold">{t('ckTitle')}</h1>
        {!o.approved && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t('ckNotApproved')}</p>}
        {o.has_issues && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{t('ckIssues')} <Link href="/store/cart" className="underline">{t('stCart')}</Link></p>}
        {o.methods.length === 0 && <p className="rounded-xl border p-3 text-sm">{t('ckNoMethods')}</p>}

        <fieldset className="space-y-3">
          <legend className="mb-1 font-medium">{t('ckAddress')}</legend>
          {o.addresses.length > 0 && (
            <select className={f} value={addrId} onChange={(e) => pick(e.target.value)} aria-label={t('ckSaved')}>
              {o.addresses.map((a) => <option key={a.id} value={a.id}>{a.label ?? a.address_line.slice(0, 40)}</option>)}
              <option value="new">{t('ckNewAddr')}</option>
            </select>
          )}
          <textarea required minLength={5} maxLength={300} rows={2} className={f} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('ckAddress')} readOnly={addrId !== 'new'} />
          {addrId === 'new' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />{t('ckSaveAddr')}</label>}
          <input required dir="ltr" pattern="\+?[0-9]{8,15}" className={f} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('ckPhone')} />
          <input maxLength={300} className={f} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={t('ckInstr')} />
          <input maxLength={500} className={f} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('ckNotes')} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-medium">{t('ckPayment')}</legend>
          {o.methods.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${method === m.id ? 'ring-2 ring-cyan-accent' : ''}`}>
              <input type="radio" name="pm" checked={method === m.id} onChange={() => setMethod(m.id)} />{t(`pm_${m.id}`)}
            </label>
          ))}
          {sel && sel.id !== 'cod' && (
            <div className="rounded-xl bg-surface p-3 text-sm">
              <p>{t('ckTo')}: <b dir="ltr">{sel.number ?? sel.handle}</b>{sel.name ? ` — ${t('ckAccName')}: ${sel.name}` : ''}</p>
              <p className="mt-1 text-muted">{t('ckTransferHint')}</p>
            </div>
          )}
        </fieldset>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <button disabled={busy || blocked} className="w-full rounded-xl bg-navy-900 py-3 font-medium text-white disabled:opacity-40">{busy ? '…' : t('ckPlace')}</button>
      </form>

      <aside className="h-fit space-y-2 rounded-2xl border bg-surface p-5 text-sm">
        <div className="flex justify-between"><span>{t('stSubtotal')}</span><span dir="ltr">{money(o.subtotal, lang)}</span></div>
        <div className="flex justify-between"><span>{t('ckFee')}</span><span dir="ltr">{money(o.delivery_fee, lang)}</span></div>
        <div className="flex justify-between border-t pt-2 text-lg font-semibold"><span>{t('ckTotal')}</span><span dir="ltr">{money(o.total, lang)}</span></div>
        <p className="pt-1 text-xs text-muted">{t('ckOnAccount')}</p>
      </aside>
    </main>
  );
}
