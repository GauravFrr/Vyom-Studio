import { useLocation, Link, useNavigate } from 'react-router-dom'
import { Bell, Search, Plus, Menu, LogOut } from 'lucide-react'
import Badge from './ui/Badge'
import Button from './ui/Button'
import MagneticButton from './MagneticButton'
import { useSidebar } from '../context/SidebarContext'
import useAuthStore from '../store/authStore'
import useProjectStore from '../store/projectStore'
import { authApi } from '../api/client'

const TITLES = {
  '/':                { title: 'Dashboard',       sub: 'Your studio at a glance' },
  '/projects':        { title: 'Projects',        sub: 'Manage all your stories' },
  '/media':           { title: 'Media Library',   sub: 'Images · videos · audio on disk' },
  '/story-editor':    { title: 'Story Editor',    sub: 'Idea → full narrative → scenes' },
  '/storyboard':      { title: 'Storyboard',      sub: 'Visual scene manager' },
  '/scene-prompts':   { title: 'Scene Prompts',   sub: 'Master prompt → image + animation' },
  '/image-generator': { title: 'Image Generator', sub: 'Nano · VEO · Imagen · FLUX' },
  '/video-generator': { title: 'Video Generator', sub: 'VEO 3 · LTX · CogVideoX' },
  '/insta-pvt':              { title: 'Insta AI',        sub: 'AI influencer toolkit' },
  '/insta-pvt/transform':        { title: 'Pvt Transform',       sub: 'Durex photo edit' },
  '/insta-pvt/transform-video':  { title: 'Pvt Video Transform', sub: 'Durex clip + prompt' },
  '/insta-pvt/face-image':   { title: 'Face Copy',       sub: 'Scene + model face → image' },
  '/insta-pvt/face-video':   { title: 'Face Swap Video', sub: 'Reel + model face → clip' },
  '/assets':          { title: 'Asset Library',   sub: 'Reusable characters & backgrounds' },
  '/export':          { title: 'Export',          sub: 'Assemble & download' },
  '/settings':        { title: 'Settings',        sub: 'API keys · defaults · preferences' },
}

export default function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const clearProject = useProjectStore((s) => s.clearProject)
  const meta = TITLES[pathname]
    || (pathname.startsWith('/insta-pvt') ? TITLES['/insta-pvt'] : null)
    || { title: 'VYOM Studio', sub: '' }
  const { toggle, open } = useSidebar()

  const initials = (user?.name || user?.email || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      /* ignore */
    }
    clearProject()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header
      className={[
        'flex items-center justify-between gap-3 h-16 px-4 sm:px-5 flex-shrink-0',
        /* Frosted sticky header — page content blurs underneath while scrolling */
        'topbar-glass isolate',
        'max-lg:-mx-4 max-lg:px-4',
        'lg:rounded-[22px]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={toggle}
          className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors duration-200 flex-shrink-0"
          aria-label={open ? 'Close sidebar' : 'Open sidebar'}
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex flex-col leading-tight min-w-0">
          <h1 className="font-display font-bold text-sm sm:text-base text-text-primary truncate">{meta.title}</h1>
          {meta.sub && (
            <span className="hidden sm:block text-[10px] text-text-muted uppercase tracking-widest mt-0.5 truncate">
              {meta.sub}
            </span>
          )}
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 px-3.5 h-10 w-72 lg:w-80 xl:w-96 rounded-xl bg-bg-elevated/80 border border-border text-text-muted focus-within:border-accent focus-within:shadow-glow-violet-soft transition-all duration-200 flex-shrink-0">
        <Search className="w-4 h-4 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search projects, scenes, prompts…"
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        <kbd className="hidden lg:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-base text-text-muted border border-border">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <Badge color="violet" dot pulse className="hidden lg:inline-flex">Engine · Nano</Badge>
        <Badge color="success" dot pulse className="hidden xl:inline-flex">API</Badge>

        <button
          type="button"
          className="relative p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors duration-200"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />
        </button>

        <MagneticButton strength={4}>
          <Button as={Link} to="/projects" size="sm" icon={Plus} className="!px-2.5 sm:!px-3">
            <span className="hidden sm:inline">New Project</span>
          </Button>
        </MagneticButton>

        <div className="relative group">
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center text-xs font-bold text-white shadow-glow-violet-soft transition-transform duration-200 hover:scale-105 active:scale-95"
            aria-label="Account menu"
            title={user?.email || 'Account'}
          >
            {initials}
          </button>
          <div className="absolute right-0 top-full mt-2 w-52 rounded-[14px] border border-border-subtle bg-bg-elevated shadow-card py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-[90]">
            <div className="px-3 py-2 border-b border-border-subtle">
              <p className="text-sm font-medium text-text-primary truncate">{user?.name}</p>
              <p className="text-[11px] text-text-muted truncate">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
