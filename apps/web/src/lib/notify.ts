export type Notif = { id: string; kind: string; params: Record<string, string>; link: string | null; read_at: string | null; created_at: string };

/** Turns kind + params into text in the current language. */
export function renderNotification(n: Notif, t: (k: string) => string) {
  const p = n.params ?? {};
  const text = t(`nt_${n.kind}`).replace('{ref}', p.ref ?? '').replace('{status}', p.status_key ? t(p.status_key) : '');
  // staff notifications also say WHO the doctor is, not only the case/order code
  return p.doctor ? `${text} · ${p.doctor}${p.clinic ? ` (${p.clinic})` : ''}` : text;
}
