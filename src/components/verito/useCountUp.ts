import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Animates a number from 0 → target when `run` becomes true.
 * Respects prefers-reduced-motion by snapping straight to the target.
 */
export function useCountUp(
  target: number,
  run: boolean,
  opts?: { duration?: number },
) {
  const [value, setValue] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!run) return;
    if (reduceMotion) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = opts?.duration ?? 900;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, reduceMotion, opts?.duration]);

  return value;
}
