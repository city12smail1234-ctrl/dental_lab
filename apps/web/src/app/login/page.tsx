'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const { t } = usePrefs();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(''); setOk(false);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMsg(error.message);
    try { const me = await api<{ roles: string[] }>('/auth/me'); router.push(me.roles.some((r) => r !== 'doctor') ? '/admin' : '/dashboard'); }
    catch { router.push('/dashboard'); }
  }
  async function google() {
    await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/dashboard` } });
  }
  async function reset() {
    if (!email) { setOk(false); return setMsg(t('askEmail')); }
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` });
    setOk(!error); setMsg(error ? error.message : t('resetSent'));
  }

  const field = 'w-full rounded-xl border px-3 py-2.5';
  return (
    <main className="grid min-h-[80vh] place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border p-7">
        <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
        <input className={field} type="email" placeholder={t('email')} required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} type="password" placeholder={t('password')} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <p className={`text-sm ${ok ? 'text-cyan-accent' : 'text-red-500'}`}>{msg}</p>}
        <button disabled={loading} className="w-full rounded-xl bg-navy-900 py-2.5 font-medium text-white disabled:opacity-50">{loading ? '…' : t('enter')}</button>
        <button type="button" onClick={google} className="w-full rounded-xl border py-2.5 hover:bg-surface">{t('google')}</button>
        <button type="button" onClick={reset} className="text-sm text-cyan-accent">{t('forgot')}</button>
        <p className="text-sm text-muted">{t('noAcc')} <Link href="/register" className="text-cyan-accent">{t('signup')}</Link></p>
      </form>
    </main>
  );
}
