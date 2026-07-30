/**
 * PageTransition — slide on enter, fade on exit (sidebar navigation).
 * Per-page content stagger starts after enter completes (RouteMotionContext).
 */
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { useHomeIntroContext } from '../context/HomeIntroContext'
import { useRouteMotion } from '../context/RouteMotionContext'
import useMotionPreference from '../hooks/useMotionPreference'
import { routeEnterVariants } from '../hooks/useHomeIntro'

export default function PageTransition() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const reduce = useMotionPreference()
  const { animated: shellIntro } = useHomeIntroContext()
  const { markEnterComplete } = useRouteMotion()

  const skipWrapper = reduce || (pathname === '/' && shellIntro)

  useEffect(() => {
    if (skipWrapper) markEnterComplete()
  }, [skipWrapper, pathname, markEnterComplete])

  if (skipWrapper) {
    return <div className="w-full min-w-0">{outlet}</div>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={routeEnterVariants}
        onAnimationComplete={(definition) => {
          if (definition === 'visible') markEnterComplete()
        }}
        className="w-full min-w-0"
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
