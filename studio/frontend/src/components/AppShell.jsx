import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TopBar from './TopBar'
import EmailVerificationBanner from './EmailVerificationBanner'
import PageTransition from './PageTransition'
import { useSidebar } from '../context/SidebarContext'
import { HomeIntroProvider } from '../context/HomeIntroContext'
import { RouteMotionProvider } from '../context/RouteMotionContext'
import useAuthStore from '../store/authStore'
import useMotionPreference from '../hooks/useMotionPreference'
import useFontsReady from '../hooks/useFontsReady'
import {
  useHomeIntro,
  SMOOTH_EASE,
  pageVariants,
  contentStaggerVariants,
} from '../hooks/useHomeIntro'
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar'

const headerFade = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.72, ease: SMOOTH_EASE },
  },
}

const stickyHeaderClass = 'topbar-shell'

const SLIDE_OFFSET = SIDEBAR_WIDTH + 32

export default function AppShell() {
  const { open, setOpen } = useSidebar()
  const { pathname } = useLocation()
  const reduce = useMotionPreference()
  const fontsReady = useFontsReady()
  const { play, markPlayed } = useHomeIntro()
  const welcomeIntro = useAuthStore((s) => s.welcomeIntro)
  const clearWelcomeIntro = useAuthStore((s) => s.clearWelcomeIntro)

  const isHome = pathname === '/'
  const runShellIntro = isHome && (play || welcomeIntro) && !reduce && fontsReady
  const waitingForFonts = isHome && (play || welcomeIntro) && !reduce && !fontsReady

  const sidebarTransition = reduce
    ? { duration: 0 }
    : { duration: 0.42, ease: SMOOTH_EASE }

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setOpen(false)
    }
  }, [pathname, setOpen])

  const mainColumn = runShellIntro ? (
    <motion.div
      className="shell-main relative z-20 min-h-screen p-4"
      data-sidebar-open={open ? 'true' : 'false'}
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      onAnimationComplete={(definition) => {
        if (definition === 'visible') {
          markPlayed()
          clearWelcomeIntro()
        }
      }}
    >
      <motion.div variants={headerFade} className={stickyHeaderClass}>
        <div className="topbar-blur-halo" aria-hidden="true" />
        <TopBar />
      </motion.div>
      <motion.main
        variants={contentStaggerVariants}
        className="px-0 sm:px-2 lg:px-0 py-4 lg:py-6 max-w-[1600px] w-full mx-auto"
      >
        <EmailVerificationBanner />
        <RouteMotionProvider>
          <HomeIntroProvider animated>
            <PageTransition />
          </HomeIntroProvider>
        </RouteMotionProvider>
      </motion.main>
    </motion.div>
  ) : (
    <div
      className="shell-main relative z-20 min-h-screen p-4"
      data-sidebar-open={open ? 'true' : 'false'}
    >
      <div className={stickyHeaderClass}>
        <div className="topbar-blur-halo" aria-hidden="true" />
        <TopBar />
      </div>
      <main className="px-0 sm:px-2 lg:px-0 py-4 lg:py-6 max-w-[1600px] w-full mx-auto">
        <EmailVerificationBanner />
        <RouteMotionProvider>
          <HomeIntroProvider animated={false}>
            <PageTransition />
          </HomeIntroProvider>
        </RouteMotionProvider>
      </main>
    </div>
  )

  return (
    <div
      className={[
        'relative min-h-screen',
        waitingForFonts ? 'opacity-0' : 'opacity-100 transition-opacity duration-150',
      ].join(' ')}
    >
      <div className="aurora-bg" aria-hidden="true" />

      <AnimatePresence initial={false}>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: SMOOTH_EASE }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="sidebar"
              className={[
                'fixed z-40',
                'top-0 left-0 h-screen max-lg:w-[272px]',
                'lg:top-4 lg:left-4 lg:h-[calc(100vh-2rem)] lg:w-[272px]',
              ].join(' ')}
              initial={reduce ? false : { x: -SLIDE_OFFSET, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { x: -SLIDE_OFFSET, opacity: 0 }}
              transition={sidebarTransition}
            >
              <Sidebar />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {mainColumn}
    </div>
  )
}
