import { useState, useCallback } from 'react'

const INTRO_KEY = 'vyom-home-intro-v2'

function shouldPlayIntro() {
  if (typeof window === 'undefined') return false
  try {
    return !sessionStorage.getItem(INTRO_KEY)
  } catch {
    return false
  }
}

/**
 * First visit to home per browser session.
 * Sync read on mount — avoids a flash of content before animation starts.
 */
export function useHomeIntro() {
  const [play] = useState(shouldPlayIntro)

  const markPlayed = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  return { play, markPlayed }
}

/** Smooth deceleration — no bounce, no snap */
export const SMOOTH_EASE = [0.33, 1, 0.68, 1]

/** Shell intro: fade whole view, then header → dashboard blocks */
export const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.85,
      ease: SMOOTH_EASE,
      when: 'beforeChildren',
      staggerChildren: 0.13,
      delayChildren: 0.08,
    },
  },
}

/** Staggers dashboard sections after the header */
export const contentStaggerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.04 },
  },
}

/** Each major dashboard block */
export const blockVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: SMOOTH_EASE },
  },
}

/** Nested grids (stats, quick actions) */
export const gridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.06 },
  },
}

export const gridItemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: SMOOTH_EASE },
  },
}

/** Route enter/exit — PageTransition: slide on enter, fade on exit (no enter opacity — pages own fade) */
export const routeEnterVariants = {
  hidden: { y: 12 },
  visible: {
    y: 0,
    transition: { duration: 0.36, ease: SMOOTH_EASE },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.2, ease: SMOOTH_EASE },
  },
}

/** Per-page root stagger — wait for RouteMotionContext.enterComplete before animating */
export const pageEnterStagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
}
