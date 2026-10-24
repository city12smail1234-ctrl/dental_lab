'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

type Data = {
  prefs: { lang: string; whatsapp_number: string; whatsapp_enabled: boolean; telegram_connected: boolean; telegram_enabled: boolean; topics: string[] | null };
  server: { whatsapp: boolean; telegram: boolean; telegram_bot: string | null };
  can_whatsapp: boolean;
  recent: { id: number; channel: string; status: string; last_error: string | null; created_at: string }[];
};
const TOPICS = ['cases', 'orders', 'doctors', 'deliveries'];

/** Lets each user choose where urgent alerts go outside the website (WhatsApp / Telegram) and which alerts they want. */
export function NotificationPrefs() {
  const { t, lang } = usePrefs();
  const [d, setD] = useState<Data | null>(null);
  const [num, setNum] = useState('');
  const [wa, setWa] = useState(false);
  const [tg, setTg] = useState(false);
  const [topics, setTopics] = useState<string[]>(TOPICS);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((x: Data) => { setD(x); setNum(x.prefs.whatsapp_number ?? ''); setWa(x.prefs.whatsapp_enabled); setTg(x.prefs.telegram_enabled); setTopics(x.prefs.topics ?? TOPICS); }, []);
  useEffect(() => { api<Data>('/notifications/prefs').then(apply).catch((e) => setMsg({ ok: false, text: e.message })); }, [apply]);

  useEffect(() => {   // after the user presses Start in Telegram, notice the connection
    if (!link) return;
    const id = setInterval(() => api<Data>('/notifications/prefs').then((x) => { if (x.prefs.telegram_connected) { apply(x); setLink(null); } }).catch(() => {}), 4000);
    return () => clearInterval(id);
  }, [link, apply]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const body = { lang, whatsapp_number: num.trim() || null, whatsapp_enabled: wa, telegram_enabled: tg, topics: topics.length === TOPICS.length ? null : topics };
      apply(await api<Data>('/notifications/prefs', { method: 'PUT', body: JSON.stringify(body) })); setMsg({ ok: true, text: t('ctSaved') });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  async function connect() {
    setMsg(null);
    try { const r = await api<{ url: string }>('/notifications/telegram/link', { method: 'POST' }); setLink(r.url); window.open(r.url, '_blank', 'noopener'); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  async function test() {
    setMsg(null);
    try { const r = await api<{ queued: number }>('/notifications/test', { method: 'POST' }); setMsg({ ok: r.queued > 0, text: r.queued > 0 ? t('apTestQueued') : t('apTestNone') }); setTimeout(() => api<Data>('/notifications/prefs').then(setD).catch(() => {}), 15000); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  if (!d) return null;
  const f = 'w-full rounded-xl border px-3 py-2 text-sm';
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-2xl border p-5">
      <div><h2 className="text-lg font-semibold">{t('apTitle')}</h2><p className="text-sm text-muted">{t('apIntro')}</p></div>

      {d.can_whatsapp && (
        <div className="space-y-2 rounded-xl border p-3">
          <p className="font-medium">{t('apWa')}</p>
          {!d.server.whatsapp && <p className="text-xs text-amber-600 dark:text-amber-300">{t('apWaNotReady')}</p>}
          <input dir="ltr" className={f} placeholder={t('apWaNumber')} value={num} onChange={(e) => setNum(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} />{t('apEnabled')}</label>
        </div>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <p className="font-medium">{t('apTg')}</p>
        {!d.server.telegram && <p className="text-xs text-amber-600 dark:text-amber-300">{t('apTgNotReady')}</p>}
        {d.server.telegram && !d.prefs.telegram_connected && (
          link ? <p className="text-sm">{t('apTgWaiting')} <a href={link} target="_blank" rel="noopener noreferrer" className="text-cyan-accent underline">{t('apTgOpen')}</a></p>
               : <button onClick={connect} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-surface">{t('apTgConnect')}</button>
        )}
        {d.prefs.telegram_connected && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{t('apTgConnected')}</span>
            <label className="flex items-center gap-2"><input type="checkbox" checked={tg} onChange={(e) => setTg(e.target.checked)} />{t('apEnabled')}</label>
            <button onClick={async () => apply(await api<Data>('/notifications/telegram/unlink', { method: 'POST' }))} className="text-red-500">{t('apTgDisconnect')}</button>
          </div>
        )}
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">{t('apTopics')}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {TOPICS.map((k) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={topics.includes(k)} onChange={(e) => setTopics(e.target.checked ? [...topics, k] : topics.filter((x) => x !== k))} />{t(`apTopic_${k}`)}</label>
          ))}
        </div>
      </fieldset>

      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy} className="rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{t('apSave')}</button>
        <button onClick={test} className="rounded-xl border px-4 py-2 text-sm hover:bg-surface">{t('apTest')}</button>
      </div>
      <p className="text-xs text-muted">{t('apPrivacy')}</p>

      {d.recent.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">{t('apRecent')}</p>
          <ul className="divide-y text-sm">{d.recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{r.channel === 'whatsapp' ? t('apWa') : t('apTg')} · <span className={r.status === 'failed' ? 'text-red-500' : r.status === 'sent' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{t(`apS_${r.status}`)}</span>{r.last_error && r.status !== 'sent' ? <span className="block text-xs text-muted" dir="ltr">{r.last_error}</span> : null}</span>
              <span className="text-xs text-muted">{when(r.created_at)}</span>
            </li>
          ))}</ul>
        </div>
      )}
    </section>
  );
}
