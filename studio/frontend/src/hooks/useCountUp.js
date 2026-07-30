/**
 * useCountUp — animates a numeric value from 0 to `target` over
 * `duration` ms with ease-out cubic. Returns the animated value
 * (rounded via `decimals`). Used by stat cards.
 */
import { useEffect, useState } from 'react'

export default function useCountUp(target, { duration = 1400, decimals = 0 } = {}) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return Number(value).toFixed(decimals)
}
