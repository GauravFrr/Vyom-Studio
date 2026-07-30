import { useReducedMotion } from 'framer-motion'
import useSettingsStore from '../store/settingsStore'

/** True when OS or in-app Settings → Reduce motion is enabled. */
export default function useMotionPreference() {
  const osReduce = useReducedMotion()
  const appReduce = useSettingsStore((s) => s.reduceMotion)
  return Boolean(osReduce || appReduce)
}

export function springTransition(reduce, config = { duration: 0.18, ease: [0.16, 1, 0.3, 1] }) {
  return reduce ? { duration: 0 } : config
}
