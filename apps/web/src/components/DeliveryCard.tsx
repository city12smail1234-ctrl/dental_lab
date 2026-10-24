'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/poll';
import { usePrefs } from '@/lib/prefs';
import { DeliveryBadge } from './Badges';

type D = { id: string; reference: string; status: string; scheduled_for: string | null; delivered_at: string | null; received_by: string | null; history: { id: number; to_status: string; note: string | null; created_at: string }[] };

/** Delivery progress for the doctor. Shows nothing until a delivery exists. */
export function DeliveryCard({ orderId, caseId }: { orderId?: string; caseId?: string }) {
  const { t, lang } = usePrefs();
  const [list, setList] = useState<D[]>([]);
  const load = useCallback(() => api<D[]>(`/deliveries?${orderId ? `order_id=${orderId}` : `case_id=${caseId}`}`).then(setList).catch(() => {}), [orderId, caseId]);
  useEffect(() => { load(); }, [load]);
  usePolling(load);
  const when = (x: string) => new Date(x).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      {list.map((d) => (
        <section key={d.id} className="space-y-3 rounded-2xl border p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">{t('dvTitle')} <span className="text-muted" dir="ltr">{d.reference}</span></h2><DeliveryBadge s={d.status} /></div>
          {d.scheduled_for && <p><span className="text-muted">{t('dvDate')}: </span>{new Date(d.scheduled_for).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' })}</p>}
          {d.delivered_at && <p><span className="text-muted">{t('dvDeliveredAt')}: </span>{when(d.delivered_at)}{d.received_by ? ` · ${t('dvReceived')}: ${d.received_by}` : ''}</p>}
          <ul className="space-y-1">{[...d.history].reverse().map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2"><DeliveryBadge s={h.to_status} /><span className="text-muted">{when(h.created_at)}</span>{h.note && <span>— {h.note}</span>}</li>)}</ul>
        </section>
      ))}
    </>
  );
}
