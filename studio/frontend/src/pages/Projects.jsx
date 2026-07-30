import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FolderKanban, Search, Plus, Grid3X3, List, ArrowUpRight, Trash2,
  Copy, PenLine, Clapperboard, Image as ImageIcon, Video, Download,
  MoreHorizontal, RefreshCw, Film, Layers, CheckCircle2, Sparkles,
  ChevronRight, AlertTriangle,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import MagneticButton from '../components/MagneticButton'
import useProjectStore from '../store/projectStore'
import { projectsApi, resolveMediaUrl } from '../api/client'
import { deriveSceneStatus } from '../utils/sceneAssets'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

const STATUS_META = {
  draft: { label: 'Draft', color: 'muted' },
  in_progress: { label: 'In progress', color: 'violet' },
  complete: { label: 'Complete', color: 'success' },
}

const SCENE_STATUS = {
  pending: { label: 'Pending', color: 'muted' },
  prompts_ready: { label: 'Prompts', color: 'info' },
  image_ready: { label: 'Image', color: 'info' },
  video_ready: { label: 'Video', color: 'violet' },
  approved: { label: 'Approved', color: 'success' },
}

const GENRES = ['mythological', 'historical', 'moral', 'adventure', 'comedy', 'horror', 'sci-fi']

const SORT_OPTIONS = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Date created' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'scenes', label: 'Scene count' },
]

function formatRelativeDate(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function pipelinePercent(project, key) {
  const total = project.scene_count || 0
  if (!total) return 0
  return Math.round(((project[key] || 0) / total) * 100)
}

function StatTile({ icon: Icon, label, value, accent, reduce }) {
  const inner = (
    <Card className="relative overflow-hidden h-full">
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: accent }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-button flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${accent}, rgba(124,58,237,0.35))` }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-display text-2xl font-bold text-text-primary tabular-nums">{value}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest">{label}</div>
        </div>
      </div>
    </Card>
  )
  return reduce ? inner : <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

function ProgressRow({ label, done, total, color }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono text-text-secondary">{done}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

export default function Projects() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const setProjects = useProjectStore((s) => s.setProjects)
  const loadProjectPayload = useProjectStore((s) => s.loadProjectPayload)
  const removeProjectFromList = useProjectStore((s) => s.removeProjectFromList)
  const upsertProjectInList = useProjectStore((s) => s.upsertProjectInList)
  const clearProject = useProjectStore((s) => s.clearProject)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updated')
  const [view, setView] = useState('grid')
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [detailProject, setDetailProject] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [newName, setNewName] = useState('')
  const [newGenre, setNewGenre] = useState('mythological')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchProjects = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await projectsApi.listProjects()
      setProjects(res.data?.projects || [])
    } catch {
      setProjects([])
      toast({ kind: 'error', title: 'Could not load projects', message: 'Check that the backend is running.' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [setProjects, toast])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const stats = useMemo(() => {
    const list = projects || []
    return {
      total: list.length,
      inProgress: list.filter((p) => p.status === 'in_progress').length,
      complete: list.filter((p) => p.status === 'complete').length,
      draft: list.filter((p) => p.status === 'draft').length,
      scenes: list.reduce((n, p) => n + (p.scene_count || 0), 0),
      withVideo: list.reduce((n, p) => n + (p.scenes_with_video || 0), 0),
    }
  }, [projects])

  const filtered = useMemo(() => {
    let list = [...(projects || [])]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(q)
        || (p.genre || '').toLowerCase().includes(q)
        || (p.id || '').toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter((p) => (p.status || 'draft') === statusFilter)
    }
    list.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'scenes') return (b.scene_count || 0) - (a.scene_count || 0)
      if (sortBy === 'created') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      }
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
    })
    return list
  }, [projects, search, statusFilter, sortBy])

  const openProject = async (projectId, destination = '/story-editor') => {
    try {
      const res = await projectsApi.getProject(projectId)
      const project = res.data?.project
      if (!project) throw new Error('missing project')
      loadProjectPayload(project)
      navigate(`${destination}?project=${projectId}`)
    } catch {
      toast({ kind: 'error', title: 'Could not open project', message: 'Try refreshing the list.' })
    }
  }

  const openDetail = async (project) => {
    setDetailProject({ ...project, scenes: [] })
    setDetailLoading(true)
    try {
      const res = await projectsApi.getProject(project.id)
      setDetailProject(res.data?.project || project)
    } catch {
      toast({ kind: 'error', title: 'Could not load project details' })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast({ kind: 'violet', title: 'Name required', message: 'Give your project a title.' })
      return
    }
    setActionLoading(true)
    try {
      const res = await projectsApi.createProject({ name, genre: newGenre, scenes: [] })
      const created = res.data?.project
      if (created) {
        upsertProjectInList(created)
        setCreateOpen(false)
        setNewName('')
        toast({ kind: 'success', title: 'Project created', message: name })
        await openProject(created.id)
      }
    } catch (e) {
      toast({ kind: 'error', title: 'Create failed', message: e?.response?.data?.detail || 'Try again.' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleRename = async () => {
    if (!renameOpen) return
    const name = newName.trim()
    if (!name) return
    setActionLoading(true)
    try {
      const res = await projectsApi.updateProject(renameOpen.id, { name })
      const updated = res.data?.project
      if (updated) {
        upsertProjectInList(updated)
        if (detailProject?.id === updated.id) setDetailProject(updated)
      }
      setRenameOpen(null)
      setNewName('')
      toast({ kind: 'success', title: 'Renamed', message: name })
    } catch {
      toast({ kind: 'error', title: 'Rename failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleDuplicate = async (project) => {
    setMenuOpenId(null)
    setActionLoading(true)
    try {
      const res = await projectsApi.getProject(project.id)
      const full = res.data?.project
      if (!full) throw new Error('missing')
      const copyRes = await projectsApi.createProject({
        name: `${full.name} (copy)`,
        genre: full.genre,
        idea: full.idea,
        expanded_story: full.expanded_story,
        bible: full.bible,
        language: full.language,
        length: full.length,
        scenes: full.scenes || [],
      })
      const created = copyRes.data?.project
      if (created) {
        upsertProjectInList(created)
        toast({ kind: 'success', title: 'Project duplicated', message: created.name })
      }
    } catch {
      toast({ kind: 'error', title: 'Duplicate failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setActionLoading(true)
    try {
      await projectsApi.deleteProject(deleteConfirm.id)
      removeProjectFromList(deleteConfirm.id)
      if (detailProject?.id === deleteConfirm.id) setDetailProject(null)
      clearProject()
      setDeleteConfirm(null)
      toast({ kind: 'success', title: 'Project deleted' })
    } catch {
      toast({ kind: 'error', title: 'Delete failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-8 pb-6' }
    : { className: 'space-y-8 pb-6', initial: 'hidden', animate: 'visible', variants: { visible: { transition: { staggerChildren: 0.06 } } } }

  return (
    <Root {...rootProps}>
      {/* Hero */}
      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest">
          <FolderKanban className="w-3 h-3" />
          Project library
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-2">
              Your <span className="text-gradient-violet">projects</span>
            </h2>
            <p className="text-text-secondary max-w-xl leading-relaxed">
              Manage every story — scenes, images, clips, and export progress in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              icon={RefreshCw}
              loading={refreshing}
              onClick={() => fetchProjects(true)}
            >
              Refresh
            </Button>
            <MagneticButton strength={reduce ? 0 : 4}>
              <Button icon={Plus} onClick={() => { setNewName(''); setCreateOpen(true) }}>
                New project
              </Button>
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* Stats */}
      <motion.div
        variants={reduce ? undefined : { visible: { transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3"
      >
        <StatTile icon={FolderKanban} label="Projects" value={stats.total} accent="#7C3AED" reduce={reduce} />
        <StatTile icon={Film} label="In progress" value={stats.inProgress} accent="#8B5CF6" reduce={reduce} />
        <StatTile icon={CheckCircle2} label="Complete" value={stats.complete} accent="#10B981" reduce={reduce} />
        <StatTile icon={Layers} label="Total scenes" value={stats.scenes} accent="#3B82F6" reduce={reduce} />
        <StatTile icon={Video} label="Clips ready" value={stats.withVideo} accent="#F59E0B" reduce={reduce} />
        <StatTile icon={PenLine} label="Drafts" value={stats.draft} accent="#64748B" reduce={reduce} />
      </motion.div>

      {/* Toolbar */}
      <Card>
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, genre, or ID…"
              className="w-full h-11 pl-10 pr-4 rounded-button bg-bg-base border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'draft', 'in_progress', 'complete'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={[
                  'h-9 px-3 rounded-button border text-xs font-medium capitalize transition-colors',
                  statusFilter === s
                    ? 'border-accent/50 bg-accent/10 text-text-primary'
                    : 'border-border-subtle text-text-secondary hover:border-accent/30',
                ].join(' ')}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-11 px-3 rounded-button bg-bg-base border border-border-subtle text-sm text-text-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="flex rounded-button border border-border-subtle overflow-hidden">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`h-11 w-11 flex items-center justify-center ${view === 'grid' ? 'bg-accent/15 text-accent-glow' : 'text-text-muted'}`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`h-11 w-11 flex items-center justify-center border-l border-border-subtle ${view === 'list' ? 'bg-accent/15 text-accent-glow' : 'text-text-muted'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-3">
          Showing {filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}
        </p>
      </Card>

      {/* Project list */}
      {loading ? (
        <p className="text-sm text-text-muted text-center py-16">Loading projects…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={projects.length === 0 ? 'No projects yet' : 'No matches'}
          description={
            projects.length === 0
              ? 'Create a story in Story Editor or start a blank project here.'
              : 'Try a different search or filter.'
          }
          action={
            projects.length === 0 ? (
              <Button icon={Sparkles} onClick={() => setCreateOpen(true)}>New project</Button>
            ) : (
              <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</Button>
            )
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <ProjectGridCard
              key={project.id}
              project={project}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              onOpen={openProject}
              onDetail={openDetail}
              onRename={(p) => { setRenameOpen(p); setNewName(p.name || '') }}
              onDuplicate={handleDuplicate}
              onDelete={setDeleteConfirm}
              reduce={reduce}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border-subtle">
            {filtered.map((project) => (
              <ProjectListRow
                key={project.id}
                project={project}
                onOpen={openProject}
                onDetail={openDetail}
                onRename={(p) => { setRenameOpen(p); setNewName(p.name || '') }}
                onDuplicate={handleDuplicate}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Detail drawer */}
      <Modal
        open={Boolean(detailProject)}
        onClose={() => setDetailProject(null)}
        title={detailProject?.name || 'Project'}
        width={520}
        footer={
          detailProject && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={PenLine} onClick={() => openProject(detailProject.id, '/story-editor')}>
                Story Editor
              </Button>
              <Button size="sm" variant="ghost" icon={Clapperboard} onClick={() => openProject(detailProject.id, '/storyboard')}>
                Storyboard
              </Button>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => openProject(detailProject.id, '/export')}>
                Export
              </Button>
            </div>
          )
        }
      >
        {detailProject && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge color={STATUS_META[detailProject.status]?.color || 'muted'}>
                {STATUS_META[detailProject.status]?.label || detailProject.status}
              </Badge>
              <Badge color="muted" className="capitalize">{detailProject.genre}</Badge>
              <Badge color="muted">{detailProject.scene_count || 0} scenes</Badge>
            </div>

            {detailProject.thumbnail && (
              <img
                src={resolveMediaUrl(detailProject.thumbnail)}
                alt=""
                className="w-full aspect-video rounded-[14px] object-cover border border-border-subtle"
              />
            )}

            <div className="space-y-3">
              <ProgressRow label="Prompts ready" done={detailProject.scenes_with_prompts || 0} total={detailProject.scene_count || 0} color="#06B6D4" />
              <ProgressRow label="Images generated" done={detailProject.scenes_with_image || 0} total={detailProject.scene_count || 0} color="#3B82F6" />
              <ProgressRow label="Videos animated" done={detailProject.scenes_with_video || 0} total={detailProject.scene_count || 0} color="#7C3AED" />
            </div>

            <div className="text-xs text-text-muted space-y-1">
              <p>Updated {formatRelativeDate(detailProject.updated_at)}</p>
              <p>Created {formatRelativeDate(detailProject.created_at)}</p>
              <p className="font-mono">ID: {detailProject.id}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-muted mb-3">Scenes</p>
              {detailLoading ? (
                <p className="text-sm text-text-muted">Loading scenes…</p>
              ) : (detailProject.scenes || []).length === 0 ? (
                <p className="text-sm text-text-muted">No scenes yet — open Story Editor to add your story.</p>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {(detailProject.scenes || []).map((scene) => {
                    const st = deriveSceneStatus(scene)
                    const meta = SCENE_STATUS[st] || SCENE_STATUS.pending
                    const thumb = scene.image_url ? resolveMediaUrl(scene.image_url) : null
                    return (
                      <div
                        key={scene.id}
                        className="flex items-center gap-3 p-2.5 rounded-[14px] border border-border-subtle bg-bg-base/40"
                      >
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-bg-elevated shrink-0 border border-border-subtle">
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-4 h-4 text-text-muted" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            Scene {scene.scene_number}
                          </p>
                          <p className="text-[11px] text-text-muted truncate">
                            {scene.brief_description || scene.action || 'No description'}
                          </p>
                        </div>
                        <Badge color={meta.color}>{meta.label}</Badge>
                        {scene.video_url && <Video className="w-3.5 h-3.5 text-accent-glow shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={actionLoading} onClick={handleCreate}>Create & open</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dada Ji cricket story…" />
          <div>
            <label className="text-xs text-text-muted uppercase tracking-widest mb-2 block">Genre</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setNewGenre(g)}
                  className={[
                    'h-9 px-3 rounded-button border text-xs capitalize transition-colors',
                    newGenre === g ? 'border-accent/50 bg-accent/10 text-text-primary' : 'border-border-subtle text-text-secondary',
                  ].join(' ')}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        open={Boolean(renameOpen)}
        onClose={() => setRenameOpen(null)}
        title="Rename project"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setRenameOpen(null)}>Cancel</Button>
            <Button loading={actionLoading} onClick={handleRename}>Save</Button>
          </div>
        }
      >
        <Input label="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Delete project?"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" loading={actionLoading} onClick={handleDelete}>Delete permanently</Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary leading-relaxed">
            <strong className="text-text-primary">{deleteConfirm?.name}</strong> and all its scenes will be removed from SQLite.
            Generated files in storage are not deleted automatically.
          </p>
        </div>
      </Modal>
    </Root>
  )
}

function ProjectGridCard({
  project, menuOpenId, setMenuOpenId, onOpen, onDetail, onRename, onDuplicate, onDelete, reduce,
}) {
  const thumb = project.thumbnail ? resolveMediaUrl(project.thumbnail) : null
  const status = STATUS_META[project.status] || STATUS_META.draft
  const menuOpen = menuOpenId === project.id

  return (
    <div className={menuOpen ? 'relative z-[80]' : 'relative'}>
      <Card interactive className="h-full group">
      <div
        className="aspect-video relative overflow-hidden mb-4 rounded-[14px] border border-border-subtle cursor-pointer"
        onClick={() => onDetail(project)}
        onKeyDown={(e) => e.key === 'Enter' && onDetail(project)}
        role="button"
        tabIndex={0}
      >
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-base">
            <Clapperboard className="w-10 h-10 text-text-muted" />
          </div>
        )}
        <span className="absolute top-2 right-2">
          <Badge color={status.color}>{status.label}</Badge>
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="font-display font-semibold text-text-primary truncate">{project.name}</h3>
          <p className="text-xs text-text-muted mt-1 capitalize">
            {project.genre || 'story'} · {project.scene_count || 0} scenes · {formatRelativeDate(project.updated_at)}
          </p>
        </div>

        <div className="space-y-2">
          <ProgressRow label="Images" done={project.scenes_with_image || 0} total={project.scene_count || 0} color="#3B82F6" />
          <ProgressRow label="Videos" done={project.scenes_with_video || 0} total={project.scene_count || 0} color="#7C3AED" />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" className="flex-1" icon={PenLine} onClick={() => onOpen(project.id, '/story-editor')}>
            Open
          </Button>
          <Button size="sm" variant="ghost" icon={Clapperboard} onClick={() => onOpen(project.id, '/storyboard')} title="Storyboard" />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpenId(menuOpen ? null : project.id)}
              className="h-9 w-9 rounded-button border border-border-subtle flex items-center justify-center text-text-muted hover:text-text-primary hover:border-accent/30"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[75]" onClick={() => setMenuOpenId(null)} aria-hidden="true" />
                <div className="absolute right-0 bottom-full mb-1 z-[80] min-w-[168px] rounded-[14px] border border-border-subtle bg-bg-elevated shadow-card py-1">
                  <MenuItem icon={ChevronRight} label="View details" onClick={() => { setMenuOpenId(null); onDetail(project) }} />
                  <MenuItem icon={PenLine} label="Rename" onClick={() => { setMenuOpenId(null); onRename(project) }} />
                  <MenuItem icon={Copy} label="Duplicate" onClick={() => onDuplicate(project)} />
                  <MenuItem icon={Trash2} label="Delete" danger onClick={() => { setMenuOpenId(null); onDelete(project) }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
    </div>
  )
}

function ProjectListRow({ project, onOpen, onDetail, onRename, onDuplicate, onDelete }) {
  const thumb = project.thumbnail ? resolveMediaUrl(project.thumbnail) : null
  const status = STATUS_META[project.status] || STATUS_META.draft
  const imgPct = pipelinePercent(project, 'scenes_with_image')
  const vidPct = pipelinePercent(project, 'scenes_with_video')

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors">
      <button
        type="button"
        onClick={() => onDetail(project)}
        className="w-20 h-14 rounded-lg overflow-hidden border border-border-subtle shrink-0 bg-bg-base"
      >
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-text-muted" />
          </div>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-semibold text-text-primary truncate">{project.name}</h3>
          <Badge color={status.color}>{status.label}</Badge>
        </div>
        <p className="text-xs text-text-muted mt-0.5 capitalize">
          {project.genre} · {project.scene_count || 0} scenes · Updated {formatRelativeDate(project.updated_at)}
        </p>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted font-mono">
          <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{imgPct}%</span>
          <span className="flex items-center gap-1"><Video className="w-3 h-3" />{vidPct}%</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" icon={PenLine} onClick={() => onOpen(project.id, '/story-editor')}>Edit</Button>
        <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => onOpen(project.id, '/storyboard')}>Board</Button>
        <button type="button" onClick={() => onRename(project)} className="p-2 text-text-muted hover:text-text-primary" title="Rename"><PenLine className="w-4 h-4" /></button>
        <button type="button" onClick={() => onDuplicate(project)} className="p-2 text-text-muted hover:text-text-primary" title="Duplicate"><Copy className="w-4 h-4" /></button>
        <button type="button" onClick={() => onDelete(project)} className="p-2 text-text-muted hover:text-status-error" title="Delete"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
        danger ? 'text-status-error hover:bg-status-error/10' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
      ].join(' ')}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
