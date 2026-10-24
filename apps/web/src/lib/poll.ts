import { useEffect, useRef } from 'react';

/** Re-runs `fn` every `ms` and when the tab regains focus, so new data shows up without a manual refresh. */
export function usePolling(fn: () => void, ms = 15000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const run = () => ref.current();
    const id = setInterval(run, ms);
    window.addEventListener('focus', run);
    return () => { clearInterval(id); window.removeEventListener('focus', run); };
  }, [ms]);
}
