'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Notif, renderNotification } from '@/lib/notify';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';

export function NotificationsList() {
  const { t, lang } = usePrefs();
  const router = useRouter();
  const [data, setData] = useState<{ items: Notif[]; unread: number } | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(() => api<{ items: Notif[]; unread: number }>(`/notifications?limit=100${unreadOnly ? '&unread=1' : ''}`).then(setData).catch(() => {}), [unreadOnly]);
  useEffect(() => { load(); }, [load]);
  usePolling(load, 20000);

  async function open(n: Notif) {
    if (!n.read_at) await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [n.id] }) }).catch(() => {});
    if (n.link) router.push(n.link); else load();
  }
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('ntTitle')}</h1>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />{t('ntUnreadOnly')}</label>
          <button onClick={async () => { await api('/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) }); load(); }} className="rounded-lg border px-3 py-1.5 hover:bg-surface">{t('ntMarkAll')}</button>
        </div>
      </div>
      {!data && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
      {data?.items.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted">{t('ntNone')}</p>}
      <ul className="divide-y rounded-2xl border">
        {data?.items.map((n) => (
          <li key={n.id}>
            <button onClick={() => open(n)} className={`flex w-full items-start gap-3 p-4 text-start text-sm hover:bg-surface ${n.read_at ? 'text-muted' : ''}`}>
              {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-accent" />}
              <span>{renderNotification(n, t)}<span className="block text-xs text-muted">{when(n.created_at)}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
