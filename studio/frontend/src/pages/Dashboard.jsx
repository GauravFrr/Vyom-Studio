import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Sparkles, FolderKanban, Image as ImageIcon, Video, PenLine, ArrowUpRight,
  Zap, Clock, TrendingUp, Clapperboard,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import { projectsApi, resolveMediaUrl } from '../api/client'
import useProjectStore from '../store/projectStore'
import { useHomeIntroContext } from '../context/HomeIntroContext'
import { blockVariants, gridVariants, gridItemVariants, contentStaggerVariants } from '../hooks/useHomeIntro'

/* ============================================================
   Static building blocks — zero animation on their own.
   ============================================================ */

function StatCard({ icon: Icon, label, value, suffix, accent, animated }) {
  const inner = (
    <Card interactive className="relative overflow-hidden h-full">
      <div
        className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-button flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${accent}, rgba(124,58,237,0.4))` }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <Badge color="muted">+0%</Badge>
      </div>
      <div className="font-display text-3xl font-bold text-text-primary tabular-nums">
        {value}
        {suffix && <span className="text-base text-text-muted ml-1">{suffix}</span>}
      </div>
      <div className="text-xs text-text-muted uppercase tracking-widest mt-1">{label}</div>
    </Card>
  )

  if (!animated) return <div>{inner}</div>
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

function QuickAction({ to, icon: Icon, title, description, accent, animated }) {
  const inner = (
    <Link to={to} className="block h-full">
      <Card interactive className="flex items-center gap-4 h-full">
        <div
          className="w-12 h-12 rounded-button flex items-center justify-center flex-shrink-0 shadow-glow-violet-soft"
          style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-sm text-text-primary mb-0.5">{title}</h3>
          <p className="text-xs text-text-secondary">{description}</p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-text-muted flex-shrink-0" />
      </Card>
    </Link>
  )

  if (!animated) return <div>{inner}</div>
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

function Block({ animated, className = '', children }) {
  if (!animated) {
    return <section className={className}>{children}</section>
  }
  return (
    <motion.section variants={blockVariants} className={className}>
      {children}
    </motion.section>
  )
}

function Grid({ animated, className, children }) {
  if (!animated) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div variants={gridVariants} className={className}>
      {children}
    </motion.div>
  )
}

function ProjectCard({ project, animated }) {
  const thumb = project.thumbnail ? resolveMediaUrl(project.thumbnail) : null
  const inner = (
    <Link to={`/story-editor?project=${project.id}`} className="block h-full">
      <Card interactive className="h-full overflow-hidden">
        <div className="aspect-video bg-bg-base relative overflow-hidden mb-4 rounded-[14px] border border-border-subtle">
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-base">
              <Clapperboard className="w-8 h-8 text-text-muted" />
            </div>
          )}
          <span className="absolute top-2 right-2">
            <Badge color={project.status === 'complete' ? 'success' : project.status === 'in_progress' ? 'violet' : 'muted'}>
              {project.status || 'draft'}
            </Badge>
          </span>
        </div>
        <h3 className="font-display font-semibold text-text-primary truncate">{project.name}</h3>
        <p className="text-xs text-text-muted mt-1 capitalize">
          {project.genre || 'story'} · {project.scene_count || 0} scenes
        </p>
      </Card>
    </Link>
  )
  if (!animated) return inner
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

/* ============================================================
   Page content — static layout; motion applied by wrapper only.
   ============================================================ */

function DashboardBody({ animated = false }) {
  const projects = useProjectStore((s) => s.projects)
  const setProjects = useProjectStore((s) => s.setProjects)
  const [loadingProjects, setLoadingProjects] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await projectsApi.listProjects()
        if (!cancelled) setProjects(res.data?.projects || [])
      } catch {
        if (!cancelled) setProjects([])
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    })()
    return () => { cancelled = true }
  }, [setProjects])

  return (
    <>
      <Block animated={animated}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-4">
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-status-success" />
          Phase 1 · Foundation live
        </div>
        <h2 className="font-display font-bold text-4xl md:text-5xl leading-[1.05] tracking-tight mb-3">
          Turn a <span className="text-gradient-violet">story idea</span>
          <br />
          into a YouTube Short.
        </h2>
        <p className="text-text-secondary max-w-xl leading-relaxed mb-6">
          Script, storyboard, images, and animation — in one studio.
          Free, local, no monthly bill.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button as={Link} to="/story-editor" icon={Sparkles} size="lg">
            Start a new story
          </Button>
          <Button as={Link} to="/image-generator" variant="ghost" icon={Zap} size="lg">
            Quick image
          </Button>
        </div>
      </Block>

      <Block animated={animated}>
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-text-primary">Studio activity</h2>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>All time</span>
          </div>
        </div>
        <Grid animated={animated} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={FolderKanban} label="Total Projects" value={projects.length} accent="#7C3AED" animated={animated} />
          <StatCard icon={ImageIcon} label="Images Generated" value={0} accent="#3B82F6" animated={animated} />
          <StatCard icon={Video} label="Videos Generated" value={0} accent="#F59E0B" animated={animated} />
        </Grid>
      </Block>

      <Block animated={animated}>
        <h2 className="font-display text-lg font-semibold text-text-primary mb-4">Quick actions</h2>
        <Grid animated={animated} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickAction to="/projects" icon={FolderKanban} title="All projects" description="Manage · duplicate · delete" accent={{ from: '#7C3AED', to: '#4F46E5' }} animated={animated} />
          <QuickAction to="/story-editor" icon={PenLine} title="New story" description="Idea → full narrative" accent={{ from: '#7C3AED', to: '#4F46E5' }} animated={animated} />
          <QuickAction to="/image-generator" icon={ImageIcon} title="Generate image" description="Nano · VEO · Imagen" accent={{ from: '#3B82F6', to: '#06B6D4' }} animated={animated} />
          <QuickAction to="/video-generator" icon={Video} title="Animate clip" description="VEO 3 · LTX" accent={{ from: '#06B6D4', to: '#10B981' }} animated={animated} />
          <QuickAction to="/settings" icon={Clock} title="API usage" description="Limits, quotas, keys" accent={{ from: '#F59E0B', to: '#EF4444' }} animated={animated} />
        </Grid>
      </Block>

      <Block animated={animated}>
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-lg font-semibold text-text-primary">Recent projects</h2>
            <div className="flex items-center gap-2">
              <Badge color="muted">{projects.length} total</Badge>
              {projects.length > 0 && (
                <Button as={Link} to="/projects" variant="ghost" size="sm" icon={ArrowUpRight}>
                  View all
                </Button>
              )}
            </div>
          </div>
          {loadingProjects ? (
            <p className="text-sm text-text-muted py-8 text-center">Loading projects…</p>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Your storyboard projects will live here. Each one keeps its scenes, image variants, and generated clips together."
              action={
                <Button as={Link} to="/story-editor" icon={Sparkles}>
                  Create your first story
                </Button>
              }
            />
          ) : (
            <Grid animated={animated} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              {projects.slice(0, 6).map((p) => (
                <ProjectCard key={p.id} project={p} animated={animated} />
              ))}
            </Grid>
          )}
        </Card>
      </Block>

      <Block animated={animated} className="flex items-center justify-between text-[11px] text-text-muted">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          <span>GPU hours used this week: 0 / 30</span>
        </div>
        <span>VYOM Studio · v0.1.0</span>
      </Block>
    </>
  )
}

export default function Dashboard() {
  const { animated } = useHomeIntroContext()

  if (!animated) {
    return (
      <div className="space-y-8">
        <DashboardBody animated={false} />
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-8"
      variants={contentStaggerVariants}
      initial="hidden"
      animate="visible"
    >
      <DashboardBody animated />
    </motion.div>
  )
}
