import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  PenLine,
  FolderKanban,
  Clapperboard,
  Image as ImageIcon,
  Video,
  Mic,
  Wand2,
  Library,
  Download,
  Lock,
  Settings as SettingsIcon,
  X,
  HardDrive,
} from 'lucide-react'
import { useSidebar } from '../context/SidebarContext'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

const navStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045, delayChildren: 0.1 },
  },
}

const navSectionStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

/** Sidebar panel width — keep in sync with AppShell grid column */
export const SIDEBAR_WIDTH = 272

const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/projects', label: 'Projects', icon: FolderKanban },
    ],
  },
  {
    title: 'Create',
    items: [
      { to: '/story-editor', label: 'Story Editor', icon: PenLine },
      { to: '/storyboard', label: 'Storyboard', icon: Clapperboard },
      { to: '/scene-prompts', label: 'Scene Prompts', icon: Wand2 },
      { to: '/image-generator', label: 'Image', icon: ImageIcon },
      { to: '/video-generator', label: 'Video', icon: Video },
      { to: '/voiceover', label: 'Voiceover', icon: Mic },
    ],
  },
  {
    title: 'Studio',
    items: [
      { to: '/insta-pvt', label: 'Insta AI', icon: Lock },
      { to: '/media', label: 'Media Library', icon: HardDrive },
      { to: '/assets', label: 'Assets', icon: Library },
      { to: '/export', label: 'Export', icon: Download },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

function VyomLogo() {
  return (
    <div className="relative flex-shrink-0">
      <div className="absolute -inset-1 rounded-[14px] bg-accent/25 blur-lg opacity-70" aria-hidden="true" />
      <div className="relative w-10 h-10 rounded-[12px] bg-gradient-to-br from-accent via-[#5B21B6] to-[#312E81] flex items-center justify-center shadow-glow-violet-soft ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
          <defs>
            <linearGradient id="vyom-v" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#E0D7FF" />
            </linearGradient>
          </defs>
          <path
            d="M4 5 L12 20 L20 5"
            fill="none"
            stroke="url(#vyom-v)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="3.6" r="1.4" fill="#F59E0B" />
        </svg>
      </div>
    </div>
  )
}

function NavItem({ to, label, icon: Icon, end, onNavigate, reduce, animated }) {
  const ItemWrap = animated && !reduce ? motion.div : 'div'
  const itemWrapProps = animated && !reduce ? { variants: gridItemVariants } : {}

  return (
    <NavLink to={to} end={end} onClick={onNavigate} className="block">
      {({ isActive }) => (
        <ItemWrap
          {...itemWrapProps}
          className={[
            'group relative flex items-center gap-3 h-10 px-3 rounded-xl text-[13px]',
            'transition-colors duration-200',
            isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary',
          ].join(' ')}
          >
          {isActive && (
            reduce ? (
              <span
                className="absolute inset-0 rounded-xl bg-accent/10 border border-accent/20 shadow-[0_0_18px_-8px_rgba(124,58,237,0.55)]"
                aria-hidden="true"
              />
            ) : (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-xl bg-accent/10 border border-accent/20 shadow-[0_0_18px_-8px_rgba(124,58,237,0.55)]"
                transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.7 }}
                aria-hidden="true"
              />
            )
          )}

          <span
            className={[
              'relative z-10 flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-200',
              isActive
                ? 'bg-accent/25 text-accent-glow'
                : 'bg-white/[0.03] text-text-muted group-hover:text-accent-glow',
            ].join(' ')}
          >
            <Icon className="w-[15px] h-[15px]" strokeWidth={2} />
          </span>
          <span className="relative z-10 font-medium tracking-[-0.01em]">{label}</span>
        </ItemWrap>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { toggle, setOpen } = useSidebar()
  const reduce = useMotionPreference()

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setOpen(false)
  }

  return (
    <aside
      className={[
        'flex flex-col h-full min-h-[calc(100vh-2rem)] overflow-hidden w-full',
        'glass border-border-subtle/80 shadow-card rounded-[22px]',
        'max-lg:rounded-none max-lg:min-h-screen max-lg:border-l-0 max-lg:border-t-0 max-lg:border-b-0',
      ].join(' ')}
    >
      {/* Brand */}
      <div className="flex items-center justify-between gap-3 px-4 h-[68px] border-b border-border-subtle/80 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <VyomLogo />
          <div className="min-w-0">
            <div className="font-display font-bold text-[17px] text-gradient-brand tracking-[-0.03em] leading-none">
              VYOM
            </div>
            <div className="text-[9px] font-medium text-text-muted uppercase tracking-[0.28em] mt-1.5">
              Story Studio
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="lg:hidden p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors duration-200"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 pb-2 sidebar-scroll">
        {reduce ? (
          <div className="space-y-5">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted/80">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavItem
                      key={item.to}
                      {...item}
                      onNavigate={closeOnMobile}
                      reduce={reduce}
                      animated={false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={navStagger}
            className="space-y-5"
          >
            {NAV_SECTIONS.map((section) => (
              <motion.div key={section.title} variants={navSectionStagger}>
                <motion.div
                  variants={gridItemVariants}
                  className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted/80"
                >
                  {section.title}
                </motion.div>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavItem
                      key={item.to}
                      {...item}
                      onNavigate={closeOnMobile}
                      reduce={reduce}
                      animated
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </nav>

      {/* Footer status */}
      <div className="p-3 border-t border-border-subtle/80 flex-shrink-0">
        <div className="rounded-xl border border-border/80 bg-bg-elevated/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-status-success flex-shrink-0" />
              <span className="text-xs font-medium text-text-primary truncate">Kaggle GPU</span>
            </div>
            <span className="text-[10px] font-mono text-status-success uppercase tracking-wider flex-shrink-0">
              online
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
            FLUX · LTX tunnel ready when configured
          </p>
        </div>
      </div>
    </aside>
  )
}
