'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { usePrefs } from '@/lib/prefs';

type Work = { id: string; title_ar: string; title_en: string; description_ar: string | null; description_en: string | null; images: string[] };

// Public page: the lab's work, managed by the admin. No login needed.
export default function WorksPage() {
  const { t, lang } = usePrefs();
  const [works, setWorks] = useState<Work[] | null | 'error'>(null);
  const [open, setOpen] = useState<Work | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => { fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/works`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setWorks).catch(() => setWorks('error')); }, []);
  const title = (w: Work) => (lang === 'ar' ? w.title_ar : w.title_en);
  const desc = (w: Work) => (lang === 'ar' ? w.description_ar : w.description_en) ?? '';
  const step = useCallback((d: number) => setIdx((i) => (open ? (i + d + open.images.length) % open.images.length : 0)), [open]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    window.addEventListener('keydown', key); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [open, step]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-3xl font-semibold md:text-4xl">{t('worksT')}</h1>
        <p className="mt-2 text-muted">{t('worksSub')}</p>
      </motion.div>

      {works === null && <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-surface" />)}</div>}
      {(works === 'error' || (Array.isArray(works) && works.length === 0)) && <p className="mt-10 rounded-2xl border border-dashed p-12 text-center text-muted">{t('worksEmpty')}</p>}

      {Array.isArray(works) && (
        <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }} className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((w) => (
            <motion.li key={w.id} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}>
              <motion.button onClick={() => { setOpen(w); setIdx(0); }} whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="group block w-full overflow-hidden rounded-2xl border text-start transition-colors hover:border-cyan-accent">
                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-surface">
                  {w.images[0] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.images[0]} alt={title(w)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <Logo size={64} fill="var(--line)" />}
                  {w.images.length > 1 && <span className="absolute end-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white">{w.images.length} {t('worksPhotos')}</span>}
                </div>
                <div className="p-4"><h2 className="font-medium">{title(w)}</h2><p className="mt-1 line-clamp-2 text-sm text-muted">{desc(w)}</p></div>
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={title(open)} onClick={() => setOpen(null)}>
            <motion.div initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-bg p-4">
              {open.images.length > 0 && (
                <div className="relative overflow-hidden rounded-2xl bg-surface" dir="ltr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={open.images[idx]} alt={title(open)} className="max-h-[60vh] w-full object-contain" />
                  {open.images.length > 1 && (<>
                    <button onClick={() => step(-1)} aria-label="previous" className="absolute start-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-xl text-white">‹</button>
                    <button onClick={() => step(1)} aria-label="next" className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-xl text-white">›</button>
                  </>)}
                </div>
              )}
              {open.images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto" dir="ltr">{open.images.map((u, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <button key={u} onClick={() => setIdx(k)} className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${k === idx ? 'ring-2 ring-cyan-accent' : 'opacity-70'}`}><img src={u} alt="" className="h-full w-full object-cover" /></button>
              ))}</div>}
              <div className="p-3"><h2 className="text-xl font-semibold">{title(open)}</h2><p className="mt-1 whitespace-pre-wrap text-muted">{desc(open)}</p></div>
              <button onClick={() => setOpen(null)} className="mx-3 mb-2 rounded-full border px-5 py-2 text-sm hover:bg-surface">{t('worksClose')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
