'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

export default function Register() {
  const { t } = usePrefs();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (password.length < 8) return setMsg(t('passShort'));
    const { error } = await supabase().auth.signUp({
      email, password, options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/login` },
    });
    if (error) return setMsg(error.message);
    setDone(true);
  }

  if (done)
    return (
      <main className="grid min-h-[80vh] place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl font-semibold">{t('createdT')}</h1>
          <p className="text-muted">{t('createdD')}</p>
          <Link href="/login" className="text-cyan-accent">{t('login')}</Link>
        </div>
      </main>
    );

  const field = 'w-full rounded-xl border px-3 py-2.5';
  return (
    <main className="grid min-h-[80vh] place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border p-7">
        <h1 className="text-2xl font-semibold">{t('regTitle')}</h1>
        <input className={field} placeholder={t('fullName')} required value={name} onChange={(e) => setName(e.target.value)} />
        <input className={field} type="email" placeholder={t('email')} required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} type="password" placeholder={t('passHint')} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <p className="text-sm text-red-500">{msg}</p>}
        <button className="w-full rounded-xl bg-navy-900 py-2.5 font-medium text-white">{t('create')}</button>
        <p className="text-sm text-muted">{t('haveAcc')} <Link href="/login" className="text-cyan-accent">{t('login')}</Link></p>
      </form>
    </main>
  );
}
