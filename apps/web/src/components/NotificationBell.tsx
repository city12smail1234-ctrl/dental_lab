'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Notif, renderNotification } from '@/lib/notify';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

export function NotificationBell({ allHref }: { allHref: string }) {
  const { t, lang } = usePrefs();
  const router = useRouter();
  const [data, setData] = useState<{ items: Notif[]; unread: number }>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(() => api<{ items: Notif[]; unread: number }>('/notifications?limit=8').then(setData).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);                                   // fallback if the live connection is unavailable

  useEffect(() => {                                          // live updates (Supabase Realtime)
    let off = false; let ch: ReturnType<ReturnType<typeof supabase>['channel']> | undefined;
    (async () => {
      const { data: s } = await supabase().auth.getSession();
      const uid = s.session?.user.id;
      if (!uid || off) return;
      ch = supabase().channel(`notif-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => load())
        .subscribe();
    })();
    return () => { off = true; if (ch) supabase().removeChannel(ch); };
  }, [load]);

  async function openItem(n: Notif) {
    setOpen(false);
    if (!n.read_at) { await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [n.id] }) }).catch(() => {}); load(); }
    if (n.link) router.push(n.link);
  }
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="relative">
      <button onClick={() => { setOpen(!open); if (!open) load(); }} aria-label={t('ntTitle')} aria-expanded={open} className="relative grid h-9 min-w-9 place-items-center rounded-full border px-2 hover:bg-surface">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {data.unread > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[88vw] overflow-hidden rounded-2xl border bg-bg shadow-xl">
            <p className="border-b px-4 py-3 text-sm font-semibold">{t('ntTitle')}</p>
            {data.items.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('ntNone')}</p>}
            <ul className="max-h-80 divide-y overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={`block w-full px-4 py-3 text-start text-sm hover:bg-surface ${n.read_at ? 'text-muted' : ''}`}>
                    <span className="flex items-start gap-2">{!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-accent" />}<span>{renderNotification(n, t)}<span className="block text-xs text-muted">{when(n.created_at)}</span></span></span>
                  </button>
                </li>
              ))}
            </ul>
            <Link href={allHref} onClick={() => setOpen(false)} className="block border-t px-4 py-3 text-center text-sm text-cyan-accent hover:bg-surface">{t('ntViewAll')}</Link>
          </div>
        </>
      )}
    </div>
  );
}
