import { supabase } from './supabase';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const isForm = init.body instanceof FormData; // let the browser set the multipart boundary
  const res = await fetch(process.env.NEXT_PUBLIC_API_URL + path, {
    ...init,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${data.session?.access_token ?? ''}`, ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? res.statusText);
  }
  return res.json();
}
