/**
 * useInView — IntersectionObserver hook that returns a ref + boolean.
 * `once` means it stays true after first intersection (good for
 * count-up animations so they only run once).
 */
import { useEffect, useRef, useState } from 'react'

export default function useInView({ threshold = 0.2, once = true } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) obs.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, once])
  return [ref, inView]
}
