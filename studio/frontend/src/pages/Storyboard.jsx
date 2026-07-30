import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  FolderKanban, Sparkles, Image as ImageIcon, Video, Edit3, Trash2,
  Check, LayoutGrid, Clock, Camera, Plus, Wand2, Play, Clapperboard,
  ArrowRight, Film, Layers, TrendingUp, ListOrdered, Save,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import { useToast } from '../components/ui/Toast'
import MagneticButton from '../components/MagneticButton'
import useProjectStore from '../store/projectStore'
import useSettingsStore from '../store/settingsStore'
import { projectsApi, resolveMediaUrl, storyApi, notifyProviderFallback } from '../api/client'
import {
  deriveSceneStatus,
  readLastProjectId,
  sceneHasPrompts,
  sceneImagePrompt,
  sceneMotionPrompt,
  sceneNarrativeText,
  SCENE_ANIMATE_HANDOFF_KEY,
  SCENE_IMAGE_HANDOFF_KEY,
  writeSceneHandoff,
} from '../utils/sceneAssets'
import useMotionPreference from '../hooks/useMotionPreference'
import { useRouteMotion } from '../context/RouteMotionContext'
import { SMOOTH_EASE, gridItemVariants, pageEnterStagger } from '../hooks/useHomeIntro'
import { DEFAULT_SCENE_PROMPT_MASTER } from '../constants/scenePromptMasterDefault'

const STATUS = {
  pending:       { label: 'Pending',       color: 'muted'   },
  prompts_ready: { label: 'Prompts ready', color: 'info'    },
  image_ready:   { label: 'Image ready',   color: 'info'    },
  video_ready:   { label: 'Video ready',   color: 'violet'  },
  approved:      { label: 'Approved',      color: 'success' },
}

const FILTERS = [
  { value: 'all',           label: 'All',     icon: LayoutGrid },
  { value: 'pending',       label: 'Pending', icon: Clock      },
  { value: 'prompts_ready', label: 'Prompts', icon: Wand2      },
  { value: 'image_ready',   label: 'Images',  icon: ImageIcon  },
  { value: 'video_ready',   label: 'Videos',  icon: Video      },
  { value: 'approved',      label: 'Approved', icon: Check     },
]

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: SMOOTH_EASE },
  },
}

const gridStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.52, ease: SMOOTH_EASE },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.28, ease: SMOOTH_EASE },
  },
}

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return (
    <motion.section variants={fadeUp} className={className}>
      {children}
    </motion.section>
  )
}

function StatPill({ icon: Icon, label, value, accent, reduce }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-[18px] bg-bg-elevated/50 border border-border-subtle h-full">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold text-text-primary tabular-nums leading-none">{value}</p>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  )
  if (reduce) return <div>{inner}</div>
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

export default function Storyboard() {
  const reduce = useMotionPreference()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { enterComplete, markEnterComplete } = useRouteMotion()
  const toast = useToast()
  const scenes = useProjectStore((s) => s.scenes)
  const currentProject = useProjectStore((s) => s.currentProject)
  const loadProjectPayload = useProjectStore((s) => s.loadProjectPayload)
  const updateScene = useProjectStore((s) => s.updateScene)
  const deleteScene = useProjectStore((s) => s.deleteScene)
  const persistCurrentProject = useProjectStore((s) => s.persistCurrentProject)

  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState('grid')
  const [saving, setSaving] = useState(false)
  const [loadingProject, setLoadingProject] = useState(false)
  const [generatingPrompts, setGeneratingPrompts] = useState(false)
  const [promptSceneId, setPromptSceneId] = useState(null)
  const hydratedProjectRef = useRef(null)

  // Hydrate scenes from SQLite once per project (not when user deletes all scenes).
  useEffect(() => {
    const projectId =
      searchParams.get('project') || currentProject?.id || readLastProjectId()

    if (scenes.length > 0) {
      if (projectId) hydratedProjectRef.current = projectId
      return
    }

    if (!projectId) return
    if (hydratedProjectRef.current === projectId) return

    let cancelled = false
    hydratedProjectRef.current = projectId
    ;(async () => {
      setLoadingProject(true)
      try {
        const res = await projectsApi.getProject(projectId)
        if (!cancelled && res.data?.project) {
          loadProjectPayload(res.data.project)
        }
      } catch (e) {
        if (!cancelled) {
          hydratedProjectRef.current = null
          toast({
            kind: 'error',
            title: 'Could not load project',
            message: e?.response?.data?.detail
              ? String(e.response.data.detail)
              : 'Open Story Editor and save your story first.',
          })
        }
      } finally {
        if (!cancelled) setLoadingProject(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, currentProject?.id, scenes.length, loadProjectPayload, toast])

  // Avoid invisible cards when route enter animation does not complete.
  useEffect(() => {
    if (reduce || enterComplete) return
    const t = setTimeout(markEnterComplete, 700)
    return () => clearTimeout(t)
  }, [reduce, enterComplete, markEnterComplete])

  const filtered = useMemo(() => {
    if (filter === 'all') return scenes
    return scenes.filter((s) => deriveSceneStatus(s) === filter)
  }, [scenes, filter])

  const counts = useMemo(() => {
    const out = { all: scenes.length }
    for (const s of scenes) {
      const st = deriveSceneStatus(s)
      out[st] = (out[st] || 0) + 1
    }
    return out
  }, [scenes])

  const totalDuration = scenes.reduce(
    (acc, s) => acc + (s.duration_sec || s.estimated_duration_seconds || 0),
    0
  )
  const approvedCount = scenes.filter((s) => deriveSceneStatus(s) === 'approved').length
  const pendingPrompts = scenes.filter((s) => !sceneHasPrompts(s)).length
  const pendingImages = scenes.filter((s) => sceneHasPrompts(s) && !s.image_url).length

  const getMasterPrompt = () => {
    const settings = useSettingsStore.getState()
    return settings.scenePromptMasterPrompt?.trim() || DEFAULT_SCENE_PROMPT_MASTER
  }

  const applyPromptResults = async (rows) => {
    for (const row of rows) {
      if (!row?.id) continue
      updateScene(row.id, {
        image_prompt: row.image_prompt || '',
        negative_prompt: row.negative_prompt || '',
        motion_prompt: row.motion_prompt || '',
        status: row.image_prompt && row.motion_prompt ? 'prompts_ready' : 'pending',
      })
    }
    if (currentProject?.id) await persistCurrentProject()
  }

  const handleGeneratePrompts = async (scene) => {
    const desc = sceneNarrativeText(scene)
    if (!desc.trim()) {
      toast({ kind: 'violet', title: 'No scene text', message: 'Add a description before generating prompts.' })
      return
    }
    setPromptSceneId(scene.id)
    try {
      const res = await storyApi.scenePromptStudio({
        master_prompt: getMasterPrompt(),
        scene_text: desc,
      })
      notifyProviderFallback(res)
      const data = res.data
      if (!data?.image_prompt) throw new Error('No prompts returned')
      updateScene(scene.id, {
        image_prompt: data.image_prompt,
        motion_prompt: data.motion_prompt || '',
        status: 'prompts_ready',
      })
      if (currentProject?.id) await persistCurrentProject()
      toast({
        kind: 'success',
        title: 'Prompts ready',
        message: `Scene ${scene.scene_number ?? ''} — image + animation prompts saved.`,
      })
    } catch (e) {
      toast({
        kind: 'error',
        title: 'Prompt generation failed',
        message: e?.response?.data?.detail ? String(e.response.data.detail) : 'Could not generate prompts.',
      })
    } finally {
      setPromptSceneId(null)
    }
  }

  const handleGenerateAllPrompts = async () => {
    const need = scenes.filter((s) => !sceneHasPrompts(s))
    if (!need.length) {
      toast({ kind: 'info', title: 'All set', message: 'Every scene already has image + animation prompts.' })
      return
    }
    setGeneratingPrompts(true)
    try {
      const res = await storyApi.scenePromptStudioBatch({
        master_prompt: getMasterPrompt(),
        scenes: need.map((s) => ({
          id: s.id,
          scene_number: s.scene_number,
          brief_description: s.brief_description,
          detailed_action: s.detailed_action,
          action: s.action,
        })),
      })
      notifyProviderFallback(res)
      const rows = res.data?.scenes || []
      await applyPromptResults(rows)
      const ok = rows.filter((r) => r.image_prompt && r.motion_prompt).length
      toast({
        kind: 'success',
        title: 'Batch prompts done',
        message: `${ok} of ${need.length} scenes now have image + animation prompts.`,
      })
    } catch (e) {
      toast({
        kind: 'error',
        title: 'Batch prompts failed',
        message: e?.response?.data?.detail ? String(e.response.data.detail) : 'Could not generate prompts.',
      })
    } finally {
      setGeneratingPrompts(false)
    }
  }

  const handleApprove = (id) => {
    updateScene(id, { status: 'approved' })
    toast({ kind: 'success', title: 'Scene approved', message: 'Ready for export.' })
  }

  const handleDelete = async (id) => {
    if (!id) {
      toast({ kind: 'error', title: 'Cannot delete', message: 'Scene has no id — save the project in Story Editor first.' })
      return
    }
    if (!confirm('Delete this scene?')) return
    deleteScene(id)
    if (editing?.id === id) setEditing(null)
    if (currentProject?.id) {
      const result = await persistCurrentProject()
      if (!result.ok) {
        toast({ kind: 'error', title: 'Delete not saved', message: 'Scene removed on screen but could not update the project in the database.' })
        return
      }
    }
    toast({ kind: 'info', title: 'Scene deleted', message: currentProject?.id ? 'Saved to your project.' : 'Removed from storyboard.' })
  }

  const handleSaveEdit = (updates) => {
    if (!editing) return
    updateScene(editing.id, updates)
    setEditing(null)
    toast({ kind: 'success', title: 'Scene updated' })
  }

  const handleGenerateImage = (scene) => {
    if (!sceneHasPrompts(scene)) {
      toast({
        kind: 'violet',
        title: 'Generate prompts first',
        message: 'Each scene needs an image prompt + animation prompt before image generation.',
      })
      return
    }
    const settings = useSettingsStore.getState()
    writeSceneHandoff(SCENE_IMAGE_HANDOFF_KEY, {
      scene_id: scene.id,
      scene_number: scene.scene_number,
      label: scene.brief_description || scene.action || 'Scene',
      prompt: sceneImagePrompt(scene),
      negative_prompt: scene.negative_prompt || '',
      aspect_ratio: settings.imageDefaultAspect || '9:16',
      engine: settings.imageDefaultEngine || 'nano',
    })
    navigate('/image-generator')
    toast({
      kind: 'info',
      title: 'Opening Image Generator',
      message: `Scene ${scene.scene_number ?? ''} prompt loaded — generate to attach to storyboard.`,
    })
  }

  const handleAnimate = (scene) => {
    if (!scene.image_url) {
      toast({ kind: 'violet', title: 'Image required', message: 'Generate a scene image before animating.' })
      return
    }
    const motion = sceneMotionPrompt(scene)
    if (!motion) {
      toast({
        kind: 'violet',
        title: 'Animation prompt missing',
        message: 'Generate scene prompts first, then animate.',
      })
      return
    }
    writeSceneHandoff(SCENE_ANIMATE_HANDOFF_KEY, {
      scene_id: scene.id,
      scene_number: scene.scene_number,
      label: scene.brief_description || scene.action || 'Scene',
      image_url: scene.image_url,
      motion_prompt: motion,
      engine: 'veo3',
      veo_model: '3.1',
    })
    navigate('/video-generator')
    toast({ kind: 'info', title: 'Opening Video Generator', message: 'Scene image and action loaded — refine the animation prompt.' })
  }

  const handleSaveProject = async () => {
    if (!currentProject?.id) {
      toast({
        kind: 'violet',
        title: 'No saved project',
        message: 'Create and save a story in Story Editor first, then return here.',
      })
      return
    }
    setSaving(true)
    try {
      const result = await persistCurrentProject()
      if (result.ok) {
        toast({ kind: 'success', title: 'Project saved', message: `"${currentProject.name}" updated with latest scene assets.` })
      } else {
        toast({ kind: 'error', title: 'Save failed', message: 'Could not write project to the database.' })
      }
    } finally {
      setSaving(false)
    }
  }

  const motionReady = reduce || enterComplete

  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-10 lg:space-y-12 pb-6' }
    : {
        className: 'space-y-10 lg:space-y-12 pb-6',
        initial: 'hidden',
        animate: motionReady ? 'visible' : 'hidden',
        variants: pageEnterStagger,
      }

  return (
    <Root {...rootProps}>
      {/* Hero */}
      <Section reduce={reduce}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-5">
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-accent-secondary" />
          Visual pipeline
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Your <span className="text-gradient-violet">storyboard</span>
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <p className="text-text-secondary max-w-2xl leading-relaxed">
            Scene-by-scene control — generate AI prompts, then images, animate clips, and export when ready.
          </p>
          {currentProject?.id && (
            <Button size="sm" variant="secondary" icon={Save} loading={saving} onClick={handleSaveProject}>
              Save project
            </Button>
          )}
        </div>
      </Section>

      {/* Stats */}
      {scenes.length > 0 && (
        <Section reduce={reduce}>
          <motion.div
            variants={reduce ? undefined : gridStagger}
            initial={reduce ? false : 'hidden'}
            animate={motionReady ? 'visible' : 'hidden'}
            className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4"
          >
            <StatPill icon={Layers} label="Scenes" value={scenes.length} accent="#7C3AED" reduce={reduce} />
            <StatPill icon={Clock} label="Total runtime" value={`${totalDuration}s`} accent="#3B82F6" reduce={reduce} />
            <StatPill icon={Check} label="Approved" value={approvedCount} accent="#10B981" reduce={reduce} />
            <StatPill icon={Wand2} label="Need prompts" value={pendingPrompts} accent="#F59E0B" reduce={reduce} />
            <StatPill icon={ImageIcon} label="Need images" value={pendingImages} accent="#06B6D4" reduce={reduce} />
          </motion.div>
        </Section>
      )}

      {/* Actions + filters */}
      <Section reduce={reduce}>
        <Card className="relative overflow-hidden">
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-[0.1] pointer-events-none"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
          />
          <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-button bg-accent/15 flex items-center justify-center">
                  <Clapperboard className="w-5 h-5 text-accent-glow" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-text-primary">
                    {currentProject?.name || 'Untitled project'}
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{scenes.length} scenes</span>
                    <span className="text-border">·</span>
                    <span>{totalDuration}s</span>
                    <span className="text-border">·</span>
                    <span className="text-status-success inline-flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      {approvedCount} approved
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button as={Link} to="/scene-prompts" variant="ghost" size="sm" icon={Wand2}>
                Prompt studio
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={Wand2}
                loading={generatingPrompts}
                onClick={handleGenerateAllPrompts}
              >
                Generate all prompts
              </Button>
              <Button variant="ghost" size="sm" icon={Video}>Batch animate</Button>
              <MagneticButton strength={reduce ? 0 : 4}>
                <Button size="sm" icon={Sparkles}>Export</Button>
              </MagneticButton>
            </div>
          </div>

          {scenes.length > 0 && (
            <div className="relative mt-6 pt-6 border-t border-border-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <LayoutGroup>
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((f) => {
                    const Icon = f.icon
                    const active = filter === f.value
                    const count = counts[f.value] || 0
                    return (
                      <motion.button
                        key={f.value}
                        type="button"
                        onClick={() => setFilter(f.value)}
                        whileTap={reduce ? undefined : { scale: 0.97 }}
                        className={[
                          'relative flex items-center gap-2 pl-3 pr-3.5 h-10 rounded-pill border text-sm font-medium',
                          'transition-colors duration-250',
                          active
                            ? 'border-accent/50 text-text-primary'
                            : 'border-border-subtle text-text-secondary hover:border-accent/30 hover:text-text-primary',
                        ].join(' ')}
                      >
                        {active && !reduce && (
                          <motion.span
                            layoutId="storyboard-filter-pill"
                            className="absolute inset-0 rounded-pill bg-accent/12 border border-accent/35"
                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                          />
                        )}
                        <Icon className="relative z-10 w-3.5 h-3.5" />
                        <span className="relative z-10">{f.label}</span>
                        <span className="relative z-10 text-[10px] font-mono text-text-muted">({count})</span>
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>

              <LayoutGroup>
                <div className="flex p-1 rounded-pill bg-bg-elevated/80 border border-border-subtle w-fit">
                  {[
                    { key: 'grid', icon: LayoutGrid, label: 'Grid' },
                    { key: 'timeline', icon: ListOrdered, label: 'Timeline' },
                  ].map((v) => {
                    const active = view === v.key
                    const Icon = v.icon
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setView(v.key)}
                        className={[
                          'relative flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-sm font-medium',
                          active ? 'text-white' : 'text-text-secondary hover:text-text-primary',
                        ].join(' ')}
                      >
                        {active && !reduce && (
                          <motion.span
                            layoutId="storyboard-view-pill"
                            className="absolute inset-0 rounded-pill bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] shadow-glow-violet-soft"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <Icon className="relative z-10 w-3.5 h-3.5" />
                        <span className="relative z-10 hidden sm:inline">{v.label}</span>
                      </button>
                    )
                  })}
                </div>
              </LayoutGroup>
            </div>
          )}
        </Card>
      </Section>

      {/* Main content */}
      <Section reduce={reduce}>
        <AnimatePresence mode="wait">
          {loadingProject ? (
            <Card className="py-16 text-center">
              <p className="text-text-secondary">Loading your storyboard…</p>
            </Card>
          ) : scenes.length === 0 ? (
            <motion.div
              key="empty"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={motionReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.5, ease: SMOOTH_EASE }}
            >
              <Card className="relative overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center py-4">
                  <EmptyState
                    icon={FolderKanban}
                    title="No scenes yet"
                    description="In Story Editor: expand your idea, click Break into scenes, then Save project. Scenes appear here as cards."
                    action={
                      <Button as={Link} to="/story-editor" icon={Sparkles} size="lg">
                        Open Story Editor
                      </Button>
                    }
                  />
                  <div className="space-y-3 hidden lg:block">
                    {[
                      { n: '1', t: 'Expand your story', d: 'Story Editor → Break into scenes.' },
                      { n: '2', t: 'Generate prompts', d: 'AI writes image + animation prompt per scene.' },
                      { n: '3', t: 'Image → animate → export', d: 'Generate stills, then clips, then final Short.' },
                    ].map((step, i) => (
                      <motion.div
                        key={step.n}
                        initial={reduce ? false : { opacity: 0, x: 12 }}
                        animate={motionReady ? { opacity: 1, x: 0 } : { opacity: 0, x: 12 }}
                        transition={{ delay: reduce || !motionReady ? 0 : 0.12 + i * 0.08, duration: 0.5, ease: SMOOTH_EASE }}
                        className="flex items-start gap-4 p-4 rounded-[18px] bg-bg-elevated/40 border border-border-subtle"
                      >
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-[#4F46E5] text-white text-sm font-bold flex items-center justify-center shadow-glow-violet-soft">
                          {step.n}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{step.t}</p>
                          <p className="text-xs text-text-muted mt-1">{step.d}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          ) : view === 'grid' ? (
            <motion.div
              key={`grid-${filter}`}
              variants={reduce ? undefined : gridStagger}
              initial={reduce ? false : 'hidden'}
              animate={motionReady ? 'visible' : 'hidden'}
              exit={reduce ? undefined : { opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((s, i) => (
                  <SceneGridCard
                    key={s.id || `scene-${i}`}
                    scene={s}
                    index={i}
                    reduce={reduce}
                    onEdit={() => setEditing(s)}
                    onGeneratePrompts={() => handleGeneratePrompts(s)}
                    promptsLoading={promptSceneId === s.id}
                    onGenerateImage={() => handleGenerateImage(s)}
                    onAnimate={() => handleAnimate(s)}
                    onApprove={() => handleApprove(s.id)}
                    onDelete={() => handleDelete(s.id)}
                  />
                ))}
              </AnimatePresence>

              <motion.div variants={reduce ? undefined : cardVariants} layout>
                <Link
                  to="/story-editor"
                  className="group flex flex-col items-center justify-center text-center min-h-[300px] h-full rounded-[22px] border-2 border-dashed border-border-subtle bg-bg-base/30 p-8 hover:border-accent/40 hover:bg-accent/[0.03] transition-all duration-300"
                >
                  <motion.div
                    animate={reduce ? undefined : { y: [0, -5, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-14 h-14 rounded-2xl bg-bg-elevated border border-border-subtle flex items-center justify-center mb-4 group-hover:border-accent/40 group-hover:shadow-glow-violet-soft transition-all duration-300"
                  >
                    <Plus className="w-6 h-6 text-text-muted group-hover:text-accent-glow transition-colors" />
                  </motion.div>
                  <p className="font-display font-semibold text-text-primary mb-1">Add scenes</p>
                  <p className="text-xs text-text-muted max-w-[200px]">Story Editor → expand & breakdown</p>
                  <ArrowRight className="w-4 h-4 text-text-muted mt-3 group-hover:text-accent-glow group-hover:translate-x-0.5 transition-all" />
                </Link>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key={`timeline-${filter}`}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={motionReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.45, ease: SMOOTH_EASE }}
            >
              <TimelineView
                scenes={filtered}
                totalDuration={totalDuration}
                reduce={reduce}
                motionReady={motionReady}
                onSelect={setEditing}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <SceneEditor
        scene={editing}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
        reduce={reduce}
      />
    </Root>
  )
}

function SceneGridCard({
  scene, index, reduce, onEdit, onGeneratePrompts, promptsLoading,
  onGenerateImage, onAnimate, onApprove, onDelete,
}) {
  const status = STATUS[deriveSceneStatus(scene)] || STATUS.pending
  const hasPrompts = sceneHasPrompts(scene)
  const num = scene.scene_number ?? index + 1

  const inner = (
    <article className="group h-full rounded-[22px] border border-border-subtle bg-bg-elevated/40 overflow-hidden hover:border-accent/35 hover:shadow-glow-violet-soft transition-all duration-300">
      <div className="aspect-video bg-bg-base relative overflow-hidden">
        {scene.image_url ? (
          <img
            src={resolveMediaUrl(scene.image_url)}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-base">
            <motion.div
              animate={reduce ? undefined : { y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-dashed border-border-subtle flex items-center justify-center mx-auto mb-2 group-hover:border-accent/40 transition-colors">
                <ImageIcon className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-[10px] text-text-muted uppercase tracking-widest">
                {hasPrompts ? 'Awaiting image' : 'Needs prompts'}
              </p>
            </motion.div>
          </div>
        )}

        <span className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-accent text-white text-sm font-bold flex items-center justify-center shadow-glow-violet-soft">
          {num}
        </span>
        <span className="absolute top-3 right-3">
          <Badge color={status.color}>{status.label}</Badge>
        </span>

        {scene.video_url && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <motion.span
              whileHover={reduce ? undefined : { scale: 1.08 }}
              className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
            >
              <Play className="w-6 h-6 ml-0.5" />
            </motion.span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>

      <div className="p-5">
        <h3 className="font-display text-base font-semibold text-text-primary mb-1.5 truncate">
          {scene.brief_description || scene.action || 'Untitled scene'}
        </h3>
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-2 mb-4 min-h-[2.5rem]">
          {scene.detailed_action || scene.action || '—'}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-bg-base/50 border border-border-subtle text-[11px] text-text-muted">
            <Clock className="w-3 h-3" />
            {scene.duration_sec || scene.estimated_duration_seconds || 4}s
          </span>
          {scene.mood && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-bg-base/50 border border-border-subtle text-[11px] text-text-muted">
              <Sparkles className="w-3 h-3 text-accent-glow" />
              {scene.mood}
            </span>
          )}
          {scene.suggested_camera_angle && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-bg-base/50 border border-border-subtle text-[11px] text-text-muted">
              <Camera className="w-3 h-3" />
              {scene.suggested_camera_angle}
            </span>
          )}
        </div>

        {hasPrompts && (
          <p className="text-[11px] text-text-muted line-clamp-2 mb-3 font-mono leading-relaxed">
            {scene.image_prompt}
          </p>
        )}

        <div className="flex items-center gap-1 pt-3 border-t border-border-subtle flex-wrap">
          <ActionChip icon={Edit3} label="Edit" onClick={onEdit} />
          <ActionChip
            icon={Wand2}
            label={promptsLoading ? '…' : 'Prompts'}
            onClick={onGeneratePrompts}
          />
          <ActionChip icon={ImageIcon} label="Image" onClick={onGenerateImage} />
          <ActionChip icon={Film} label="Animate" onClick={onAnimate} />
          {scene.status !== 'approved' ? (
            <ActionChip icon={Check} label="Approve" onClick={onApprove} accent="success" />
          ) : (
            <span className="ml-auto text-[10px] uppercase tracking-wider text-status-success inline-flex items-center gap-1 px-2">
              <Check className="w-3 h-3" />
              Done
            </span>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto p-2 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
            title="Delete scene"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  )

  if (reduce) return <div>{inner}</div>
  return (
    <motion.div layout variants={cardVariants} exit="exit">
      {inner}
    </motion.div>
  )
}

function ActionChip({ icon: Icon, label, onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-medium',
        'inline-flex items-center gap-1 transition-colors duration-200',
        accent === 'success'
          ? 'text-status-success hover:bg-status-success/10'
          : 'text-text-muted hover:text-accent-glow hover:bg-white/5',
      ].join(' ')}
    >
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function TimelineView({ scenes, totalDuration, reduce, motionReady = true, onSelect }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h3 className="font-display text-lg font-semibold text-text-primary">Timeline</h3>
          <p className="text-xs text-text-muted mt-1 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" />
            {totalDuration}s total · {scenes.length} clips
          </p>
        </div>
        <Badge color="muted">{scenes.length} scenes</Badge>
      </div>

      <div className="relative">
        <div className="absolute top-8 left-0 right-0 h-px bg-border-subtle" aria-hidden="true" />
        <motion.div
          variants={reduce ? undefined : gridStagger}
          initial={reduce ? false : 'hidden'}
          animate={motionReady ? 'visible' : 'hidden'}
          className="flex gap-3 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory scrollbar-thin"
        >
          {scenes.map((s, i) => {
            const status = STATUS[deriveSceneStatus(s)] || STATUS.pending
            const dur = s.duration_sec || s.estimated_duration_seconds || 4
            const width = Math.max(100, Math.min(220, dur * 22))

            return (
              <motion.button
                key={s.id || i}
                type="button"
                variants={reduce ? undefined : cardVariants}
                whileHover={reduce ? undefined : { y: -4 }}
                onClick={() => onSelect(s)}
                className="relative flex-shrink-0 snap-start text-left rounded-[18px] border border-border-subtle bg-bg-elevated/50 overflow-hidden hover:border-accent/40 hover:shadow-glow-violet-soft transition-colors duration-300"
                style={{ width: `${width}px` }}
              >
                <div
                  className="aspect-video relative bg-bg-base"
                  style={{
                    background: s.image_url
                      ? `url(${resolveMediaUrl(s.image_url)}) center/cover`
                      : 'linear-gradient(135deg, #1A1A2E 0%, #13131F 100%)',
                  }}
                >
                  <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                    {s.scene_number ?? i + 1}
                  </span>
                  {!s.image_url && (
                    <ImageIcon className="absolute inset-0 m-auto w-5 h-5 text-text-muted opacity-40" />
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-text-secondary">{dur}s</span>
                    <Badge color={status.color} className="!text-[9px]">{status.label}</Badge>
                  </div>
                  <p className="text-xs font-medium text-text-primary truncate">
                    {s.brief_description || 'Scene'}
                  </p>
                </div>
              </motion.button>
            )
          })}
        </motion.div>
      </div>
    </Card>
  )
}

function SceneEditor({ scene, onClose, onSave, reduce }) {
  const [brief, setBrief] = useState('')
  const [action, setAction] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [motionPrompt, setMotionPrompt] = useState('')
  const [duration, setDuration] = useState(4)
  const [mood, setMood] = useState('')
  const [camera, setCamera] = useState('')

  useEffect(() => {
    if (scene) {
      setBrief(scene.brief_description || '')
      setAction(scene.detailed_action || scene.action || '')
      setImagePrompt(scene.image_prompt || '')
      setMotionPrompt(scene.motion_prompt || '')
      setDuration(scene.duration_sec || scene.estimated_duration_seconds || 4)
      setMood(scene.mood || '')
      setCamera(scene.suggested_camera_angle || '')
    }
  }, [scene])

  if (!scene) return null

  return (
    <Modal
      open={!!scene}
      onClose={onClose}
      title={`Edit scene ${scene.scene_number ?? ''}`}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <MagneticButton strength={reduce ? 0 : 3}>
            <Button
              icon={Check}
              onClick={() => onSave({
                brief_description: brief,
                detailed_action: action,
                image_prompt: imagePrompt,
                motion_prompt: motionPrompt,
                duration_sec: duration,
                mood,
                suggested_camera_angle: camera,
                status: imagePrompt.trim() && motionPrompt.trim() ? 'prompts_ready' : 'pending',
              })}
            >
              Save changes
            </Button>
          </MagneticButton>
        </>
      }
    >
      <div className="space-y-5">
        <Input label="Brief title" value={brief} onChange={(e) => setBrief(e.target.value)} />
        <Input
          label="Detailed action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          multiline
          rows={4}
          inputClassName="min-h-[100px]"
        />
        <Input
          label="Image prompt (for still generation)"
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
          multiline
          rows={4}
          inputClassName="min-h-[100px] font-mono text-sm"
          placeholder="Generate via Prompts button, or paste your own…"
        />
        <Input
          label="Animation prompt (for image-to-video)"
          value={motionPrompt}
          onChange={(e) => setMotionPrompt(e.target.value)}
          multiline
          rows={3}
          inputClassName="min-h-[80px] font-mono text-sm"
          placeholder="Camera move + subject motion…"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Duration (seconds)"
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value) || 0)}
            mono
          />
          <Input
            label="Mood"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="tense, magical…"
          />
        </div>
        <Input
          label="Camera angle"
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
          placeholder="wide shot, close-up…"
        />
      </div>
    </Modal>
  )
}
