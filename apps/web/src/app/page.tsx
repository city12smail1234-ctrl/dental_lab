'use client';
import Link from 'next/link';
import { motion, useScroll, useSpring, useTransform, Variants } from 'motion/react';
import { ReactNode, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { PriceList } from '@/components/PriceList';
import { usePrefs } from '@/lib/prefs';

// Classic shade-guide codes with approximate display colors.
const SHADES: [string, string][] = [['A1', '#F4EAD5'], ['A2', '#EEDDBE'], ['A3', '#E6CFA6'], ['B1', '#F6EEDC'], ['B2', '#EFE2C6'], ['C1', '#E9DFCD'], ['D2', '#E4D6C0']];
const up: Variants = { hidden: { opacity: 0, y: 32 }, show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.08, ease: 'easeOut' } }) };

function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return <motion.div variants={up} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} className={className}>{children}</motion.div>;
}

export default function Home() {
  const { t } = usePrefs();
  const [shade, setShade] = useState(SHADES[1]);
  const hero = useRef<HTMLElement>(null);
  const steps = useRef<HTMLOListElement>(null);
  const { scrollYProgress: heroP } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const toothY = useTransform(heroP, [0, 1], [0, 90]);
  const { scrollYProgress: stepP } = useScroll({ target: steps, offset: ['start 75%', 'end 60%'] });
  const line = useSpring(stepP, { stiffness: 90, damping: 20 });
  const words = t('h1').split(' ');

  return (
    <main className="overflow-x-clip">
      {/* HERO */}
      <section ref={hero} className="relative">
        <motion.div aria-hidden animate={{ x: [0, 60, -20, 0], y: [0, -30, 40, 0], scale: [1, 1.15, 0.95, 1] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -top-24 start-[-8%] h-80 w-80 rounded-full bg-cyan-accent/20 blur-3xl" />
        <motion.div aria-hidden animate={{ x: [0, -50, 30, 0], y: [0, 40, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -bottom-10 end-[-6%] h-96 w-96 rounded-full bg-navy-700/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <motion.span initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="inline-block rounded-full border px-4 py-1 text-xs text-muted">{t('heroBadge')}</motion.span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.3] md:text-5xl">
              {words.map((w, k) => <motion.span key={k} initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.55, delay: 0.15 + k * 0.07 }} className="me-[0.3em] inline-block">{w}</motion.span>)}
            </h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.7 }} className="mt-5 max-w-md text-lg leading-8 text-muted">{t('sub')}</motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.6 }} className="mt-8 flex flex-wrap gap-3">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}><Link href="/register" className="block rounded-full bg-navy-900 px-6 py-3 font-medium text-white">{t('cta1')}</Link></motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}><Link href="/login" className="block rounded-full border px-6 py-3 font-medium hover:bg-surface">{t('cta2')}</Link></motion.div>
            </motion.div>
          </div>

          <motion.div style={{ y: toothY }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative rounded-3xl border bg-surface/80 p-6 backdrop-blur">
            <div className="relative grid place-items-center py-8">
              <motion.div aria-hidden animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} className="absolute h-64 w-64 rounded-full border border-dashed border-cyan-accent/50" />
              <motion.div aria-hidden animate={{ rotate: -360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }} className="absolute h-80 w-80 rounded-full border border-dashed border-line"><span className="absolute -top-1.5 start-1/2 h-3 w-3 rounded-full bg-cyan-accent" /></motion.div>
              {[0, 1, 2, 3, 4].map((k) => <motion.span key={k} aria-hidden animate={{ y: [0, -18, 0], opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 3 + k, repeat: Infinity, delay: k * 0.6 }} className="absolute h-2 w-2 rounded-full bg-cyan-accent" style={{ top: `${12 + k * 16}%`, insetInlineStart: `${10 + ((k * 23) % 80)}%` }} />)}
              <motion.div animate={{ y: [0, -12, 0], rotate: [-2, 2, -2] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} whileHover={{ scale: 1.08 }}>
                <motion.div animate={{ filter: `drop-shadow(0 20px 30px ${shade[1]}66)` }}><Logo size={190} fill={shade[1]} /></motion.div>
              </motion.div>
            </div>
            <div className="flex items-end justify-between">
              <div><p className="text-sm text-muted">{t('shadeNow')}</p><motion.p key={shade[0]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold" dir="ltr">{shade[0]}</motion.p></div>
              <p className="text-sm text-muted">{t('shade')}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('shade')}>
              {SHADES.map((s) => (
                <motion.button key={s[0]} onClick={() => setShade(s)} aria-pressed={shade[0] === s[0]} whileHover={{ y: -4, scale: 1.08 }} whileTap={{ scale: 0.92 }} className={`h-11 w-11 rounded-xl border text-xs font-medium ${shade[0] === s[0] ? 'ring-2 ring-cyan-accent' : ''}`} style={{ background: s[1], color: '#0b2545' }} dir="ltr">{s[0]}</motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* PRICE LIST */}
      <section id="services" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <h2 className="text-2xl font-semibold md:text-3xl">{t('priceT')}</h2>
          <p className="mt-2 text-muted">{t('priceSub')}</p>
        </Reveal>
        <Reveal i={1} className="mt-8"><PriceList /></Reveal>
        <Reveal i={2} className="mt-6"><Link href="/prices" className="text-sm text-cyan-accent underline">{t('priceT')} →</Link></Reveal>
      </section>

      {/* FEATURES */}
      <section className="border-y bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal><h2 className="text-2xl font-semibold md:text-3xl">{t('featT')}</h2></Reveal>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Reveal key={n} i={n} className="flex gap-4">
                <motion.span whileHover={{ scale: 1.2, rotate: 8 }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-accent/15 text-cyan-accent"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg></motion.span>
                <div><h3 className="font-medium">{t(`f${n}`)}</h3><p className="mt-1 leading-7 text-muted">{t(`f${n}d`)}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS: the line draws as you scroll */}
      <section id="process" className="mx-auto max-w-3xl px-5 py-20">
        <Reveal><h2 className="text-2xl font-semibold md:text-3xl">{t('processT')}</h2></Reveal>
        <ol ref={steps} className="relative mt-12 space-y-14 ps-14">
          <span aria-hidden className="absolute start-[19px] top-2 bottom-2 w-0.5 bg-line" />
          <motion.span aria-hidden style={{ scaleY: line, transformOrigin: 'top' }} className="absolute start-[19px] top-2 bottom-2 w-0.5 bg-cyan-accent" />
          {[1, 2, 3].map((n) => (
            <motion.li key={n} initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }} className="relative rtl:[&]:translate-x-0">
              <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: 'spring', delay: 0.15 }} className="absolute -start-14 top-0 grid h-10 w-10 place-items-center rounded-full bg-navy-900 font-semibold text-white">{n}</motion.span>
              <h3 className="text-xl font-medium">{t(`p${n}`)}</h3>
              <p className="mt-1 leading-7 text-muted">{t(`p${n}d`)}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* PAYMENT */}
      <section id="payment" className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal><h2 className="text-2xl font-semibold md:text-3xl">{t('payT')}</h2></Reveal>
        <div className="mt-6 flex flex-wrap gap-3">
          {['pay1', 'pay2', 'pay3'].map((k, i) => <Reveal key={k} i={i}><motion.span whileHover={{ y: -4, scale: 1.05 }} className="inline-block rounded-full border px-5 py-2 font-medium">{t(k)}</motion.span></Reveal>)}
        </div>
        <Reveal i={3}><p className="mt-4 max-w-xl text-muted">{t('payNote')}</p></Reveal>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <Reveal>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-navy-700 px-6 py-16 text-center text-white" style={{ background: 'linear-gradient(135deg,#0b2545,#13315c)' }}>
            <motion.div aria-hidden animate={{ x: ['-120%', '120%'] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }} className="absolute inset-y-0 w-1/3 -skew-x-12 bg-white/10" />
            <h2 className="relative text-3xl font-semibold">{t('ctaT')}</h2>
            <p className="relative mx-auto mt-3 max-w-md text-white/80">{t('ctaD')}</p>
            <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="relative mt-8 inline-block"><Link href="/register" className="block rounded-full bg-white px-8 py-3 font-medium text-[#0b2545]">{t('cta1')}</Link></motion.div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted">© {new Date().getFullYear()} City Smile Dental Lab — {t('rights')}</footer>
    </main>
  );
}
