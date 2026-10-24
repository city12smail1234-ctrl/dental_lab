'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

export type CaseFile = { id: string; original_name: string; size_bytes: number; uploader_role: string; created_at: string };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Files live in a private bucket: opening a file asks the API for a 5-minute signed link. */
export function CaseFiles({ base, caseId, files, canUpload, canDelete, onChange, notice }: {
  base: string; caseId: string; files: CaseFile[]; canUpload: boolean; canDelete: (f: CaseFile) => boolean; onChange: (c: never) => void; notice?: boolean;
}) {
  const { t, lang } = usePrefs();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(list: FileList) {
    setBusy(true); setErr('');
    for (const f of Array.from(list)) {
      try { const fd = new FormData(); fd.append('file', f); onChange((await api(`${base}/${caseId}/files`, { method: 'POST', body: fd })) as never); }
      catch (e) { setErr(`${f.name}: ${(e as Error).message}`); break; }
    }
    setBusy(false);
  }
  async function open(f: CaseFile) {
    try { const r = await api<{ url: string }>(`${base}/${caseId}/files/${f.id}/url`); window.open(r.url, '_blank', 'noopener'); } catch (e) { setErr((e as Error).message); }
  }
  async function del(f: CaseFile) {
    if (!confirm(t('fiConfirmDel'))) return;
    try { onChange((await api(`${base}/${caseId}/files/${f.id}`, { method: 'DELETE' })) as never); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section className="space-y-3 rounded-2xl border p-5">
      <h2 className="font-medium">{t('fiTitle')}</h2>
      {notice && <p className="rounded-xl bg-amber-500/10 p-3 text-sm">{t('fiFailed')}</p>}
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
      {files.length === 0 && <p className="text-sm text-muted">{t('fiNone')}</p>}
      <ul className="divide-y text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0"><span className="block truncate" dir="ltr">{f.original_name}</span><span className="text-xs text-muted">{size(f.size_bytes)} · {f.uploader_role === 'doctor' ? t('fiDoctor') : t('fiStaff')} · {new Date(f.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</span></span>
            <span className="flex gap-2">
              <button onClick={() => open(f)} className="rounded-lg border px-3 py-1 hover:bg-surface">{t('fiOpen')}</button>
              {canDelete(f) && <button onClick={() => del(f)} className="rounded-lg border px-3 py-1 text-red-500 hover:bg-surface">{t('fiDelete')}</button>}
            </span>
          </li>
        ))}
      </ul>
      {canUpload && files.length < 10 && (
        <label className="block text-sm">
          <span className="text-muted">{busy ? t('fiUploading') : t('fiUpload')}</span>
          <input type="file" multiple disabled={busy} accept=".jpg,.jpeg,.png,.webp,.pdf,.zip,.stl,.ply" className="mt-1 block" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
          <span className="text-xs text-muted">{t('fiHint')}</span>
        </label>
      )}
    </section>
  );
}
