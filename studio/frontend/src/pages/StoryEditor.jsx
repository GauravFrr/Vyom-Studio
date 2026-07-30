import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Sparkles, Loader2, Wand2, ChevronDown, Film, Clock, Camera, Check,
  BookOpen, History, Trash2, Settings2, Layers, PenLine, FileText, Clapperboard,
  RotateCcw, ArrowRight, Save,
} from 'lucide-react'
import { storyApi, projectsApi, notifyProviderFallback } from '../api/client'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import EngineToggle from '../components/ui/EngineToggle'
import CustomSelect from '../components/ui/CustomSelect'
import Skeleton from '../components/ui/Skeleton'
import FriendlyError from '../components/ui/FriendlyError'
import MagneticButton from '../components/MagneticButton'
import useSettingsStore from '../store/settingsStore'
import useProjectStore from '../store/projectStore'
import useStoryStyleStore, { DEFAULT_SAMPLE_STORY, DEFAULT_STYLE_NOTES } from '../store/storyStyleStore'
import { useToast } from '../components/ui/Toast'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'
import { normalizeScenes } from '../utils/sceneAssets'

const GENRES = [
  { key: 'mythological', label: 'Mythological', symbol: '✦', accent: '#7C3AED' },
  { key: 'horror',       label: 'Horror',       symbol: '☽', accent: '#6366F1' },
  { key: 'romance',      label: 'Romance',      symbol: '♡', accent: '#EC4899' },
  { key: 'comedy',       label: 'Comedy',       symbol: '☺', accent: '#F59E0B' },
  { key: 'thriller',     label: 'Thriller',       symbol: '◈', accent: '#EF4444' },
  { key: 'fantasy',      label: 'Fantasy',      symbol: '✧', accent: '#06B6D4' },
]

const LENGTHS = [
  { key: 'short',  label: '30s',      sub: 'Quick Short' },
  { key: 'medium', label: '1–2 min',  sub: 'Standard' },
  { key: 'long',   label: '3–5 min',  sub: 'Extended' },
]

const PIPELINE = [
  { key: 'idea',   label: 'Idea',   icon: PenLine },
  { key: 'story',  label: 'Story',  icon: FileText },
  { key: 'scenes', label: 'Scenes', icon: Clapperboard },
]

const pageStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.11, delayChildren: 0.06 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: SMOOTH_EASE },
  },
}

const sceneListVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.08 },
  },
}

const sceneCardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: SMOOTH_EASE },
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

function getPipelineState(idea, expandedStory, scenes) {
  if (scenes.length > 0) return { step: 3, active: 'scenes' }
  if (expandedStory) return { step: 2, active: 'story' }
  if (idea.trim()) return { step: 1, active: 'idea' }
  return { step: 0, active: 'idea' }
}

function defaultProjectName(idea, expandedStory) {
  const src = (idea || expandedStory || '').trim().replace(/\s+/g, ' ')
  if (!src) return 'Untitled story'
  return src.length > 60 ? `${src.slice(0, 57)}…` : src
}

export default function StoryEditor() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const s = useSettingsStore.getState()

  const currentProject = useProjectStore((st) => st.currentProject)
  const loadProjectPayload = useProjectStore((st) => st.loadProjectPayload)
  const setScenes = useProjectStore((st) => st.setScenes)
  const upsertProjectInList = useProjectStore((st) => st.upsertProjectInList)
  const clearProject = useProjectStore((st) => st.clearProject)

  const [idea, setIdea] = useState('')
  const [genre, setGenre] = useState(s.storyDefaultGenre || 'mythological')
  const [length, setLength] = useState(s.storyDefaultLength || 'short')
  const [language, setLanguage] = useState(s.storyDefaultLanguage || 'english')
  const [loading, setLoading] = useState(false)
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedStory, setExpandedStory] = useState('')
  const scenes = useProjectStore((st) => st.scenes)
  const [bibleOpen, setBibleOpen] = useState(false)
  const [bible, setBible] = useState(s.storyContinuityBible || '')
  const [projectName, setProjectName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingProject, setLoadingProject] = useState(false)

  const styleStore = useStoryStyleStore
  const sampleStory       = styleStore((st) => st.sampleStory)
  const styleNotes        = styleStore((st) => st.styleNotes)
  const enableSample      = styleStore((st) => st.enableSampleStory)
  const enableNotes       = styleStore((st) => st.enableStyleNotes)
  const includeMemory     = styleStore((st) => st.includeMemoryInPrompt)
  const remembered        = styleStore((st) => st.rememberedProjects)
  const setEnableSample   = styleStore((st) => st.setEnableSampleStory)
  const setEnableNotes    = styleStore((st) => st.setEnableStyleNotes)
  const setIncludeMemory  = styleStore((st) => st.setIncludeMemoryInPrompt)
  const setSampleStory    = styleStore((st) => st.setSampleStory)
  const setStyleNotes     = styleStore((st) => st.setStyleNotes)
  const forgetProject     = styleStore((st) => st.forgetProject)
  const rememberProject   = styleStore((st) => st.rememberProject)
  const clearMemory       = styleStore((st) => st.clearMemory)
  const resetStyle        = styleStore((st) => st.resetStyle)
  const setLanguageStyle  = styleStore((st) => st.setLanguage)
  const languageStyle     = styleStore((st) => st.language)

  const [contextOpen, setContextOpen] = useState(false)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(true)

  const { step: pipelineStep, active: activePipeline } = getPipelineState(idea, expandedStory, scenes)

  const applyProject = useCallback(
    (project) => {
      if (!project) return
      loadProjectPayload(project)
      setIdea(project.idea || '')
      setExpandedStory(project.expanded_story || '')
      setGenre(project.genre || s.storyDefaultGenre || 'mythological')
      setLength(project.length || s.storyDefaultLength || 'short')
      setLanguage(project.language || s.storyDefaultLanguage || 'english')
      setBible(project.bible || s.storyContinuityBible || '')
      setProjectName(project.name || defaultProjectName(project.idea, project.expanded_story))
      setScenes(normalizeScenes(project.scenes))
      setSearchParams({ project: project.id }, { replace: true })
    },
    [loadProjectPayload, setSearchParams, s.storyContinuityBible, s.storyDefaultGenre, s.storyDefaultLanguage, s.storyDefaultLength],
  )

  useEffect(() => {
    const projectId = searchParams.get('project')
    if (!projectId || currentProject?.id === projectId) return
    let cancelled = false
    ;(async () => {
      setLoadingProject(true)
      try {
        const res = await projectsApi.getProject(projectId)
        if (!cancelled && res.data?.project) applyProject(res.data.project)
      } catch (e) {
        if (!cancelled) {
          toast({
            kind: 'error',
            title: 'Could not load project',
            message: e?.response?.data?.detail ? String(e.response.data.detail) : 'Project not found.',
          })
        }
      } finally {
        if (!cancelled) setLoadingProject(false)
      }
    })()
    return () => { cancelled = true }
  }, [searchParams, currentProject?.id, applyProject, toast])

  useEffect(() => {
    if (!expandedStory || loading) return
    const trimmed = expandedStory.trim()
    if (!trimmed) return
    const firstSentence = trimmed.split(/[।.!\n]/)[0]?.trim().slice(0, 200) || ''
    const provider = useSettingsStore.getState().storyProvider || 'auto'
    rememberProject({
      idea: idea.trim().slice(0, 200),
      summary: firstSentence,
      provider,
      createdAt: new Date().toISOString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedStory, loading])

  const handleExpand = async () => {
    if (!idea.trim()) return
    setLoading(true)
    setError('')
    setExpandedStory('')
    setScenes([])
    setBreakdownLoading(false)
    try {
      const provider = useSettingsStore.getState().storyProvider
      const providerField = provider && provider !== 'auto' ? { provider } : {}
      const expand = await storyApi.expand({
        idea, genre, language, target_length: length,
        ...providerField,
      })
      notifyProviderFallback(expand)
      if (expand.data?.success) {
        setExpandedStory(expand.data.expanded_story)
      }
    } catch (err) {
      console.error(err)
      setError(
        err?.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to generate. Check console for details.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleBreakdown = async () => {
    if (!expandedStory.trim()) return
    setBreakdownLoading(true)
    setError('')
    setScenes([])
    try {
      const provider = useSettingsStore.getState().storyProvider
      const providerField = provider && provider !== 'auto' ? { provider } : {}
      const bd = await storyApi.breakdown({
        story: expandedStory,
        max_scenes: useSettingsStore.getState().storyDefaultMaxScenes || 6,
        min_duration_per_scene: useSettingsStore.getState().storyDefaultMinSceneDuration || 4,
        ...providerField,
      })
      notifyProviderFallback(bd)
      if (bd.data?.success) setScenes(normalizeScenes(bd.data.scenes))
    } catch (err) {
      console.error(err)
      setError(
        err?.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to break into scenes. Check console for details.'
      )
    } finally {
      setBreakdownLoading(false)
    }
  }

  const handleReset = () => {
    setIdea('')
    setExpandedStory('')
    setScenes([])
    setProjectName('')
    setError('')
    clearProject()
    setSearchParams({}, { replace: true })
  }

  const handleSaveProject = async () => {
    if (!idea.trim() && !expandedStory.trim() && scenes.length === 0) {
      toast({ kind: 'violet', title: 'Nothing to save', message: 'Add an idea or generate a story first.' })
      return
    }
    const name = (projectName || defaultProjectName(idea, expandedStory)).trim()
    const payload = {
      name,
      genre,
      idea,
      expanded_story: expandedStory,
      bible,
      language,
      length,
      scenes,
    }
    setSaving(true)
    setError('')
    try {
      const projectId = currentProject?.id || searchParams.get('project')
      const res = projectId
        ? await projectsApi.updateProject(projectId, payload)
        : await projectsApi.createProject(payload)
      const project = res.data?.project
      if (!project) throw new Error('Save returned no project')
      applyProject(project)
      upsertProjectInList(project)
      toast({ kind: 'success', title: 'Project saved', message: `"${project.name}" is stored locally in SQLite.` })
    } catch (e) {
      const msg = e?.response?.data?.detail ? String(e.response.data.detail) : 'Could not save project.'
      setError(msg)
      toast({ kind: 'error', title: 'Save failed', message: msg })
    } finally {
      setSaving(false)
    }
  }

  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-10 lg:space-y-12' }
    : {
        className: 'space-y-10 lg:space-y-12',
        initial: 'hidden',
        animate: 'visible',
        variants: pageStagger,
      }

  return (
    <Root {...rootProps}>
      {/* ── Hero + pipeline ── */}
      <Section reduce={reduce}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-5">
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-accent animate-pulse" />
          Story pipeline
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          From <span className="text-gradient-violet">spark</span> to storyboard
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed mb-8">
          Drop in a rough idea. The model expands it into a full narrative — then you choose when to split it into scenes.
        </p>

        <LayoutGroup>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {PIPELINE.map((step, i) => {
              const Icon = step.icon
              const done = pipelineStep > i + 1
              const active = activePipeline === step.key
              const reached = pipelineStep >= i + 1

              return (
                <div key={step.key} className="flex items-center gap-2 sm:gap-3">
                  <motion.div
                    layout
                    className={[
                      'relative flex items-center gap-2.5 pl-3 pr-4 h-11 rounded-pill border transition-colors duration-300',
                      active
                        ? 'border-accent/50 text-text-primary'
                        : reached
                          ? 'border-border-subtle text-text-secondary'
                          : 'border-border/60 text-text-muted',
                    ].join(' ')}
                  >
                    {active && !reduce && (
                      <motion.span
                        layoutId="story-pipeline-pill"
                        className="absolute inset-0 rounded-pill bg-accent/10 border border-accent/30"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span
                      className={[
                        'relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                        done
                          ? 'bg-accent text-white shadow-glow-violet-soft'
                          : reached
                            ? 'bg-bg-elevated border border-accent/40 text-accent-glow'
                            : 'bg-bg-elevated border border-border text-text-muted',
                      ].join(' ')}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    </span>
                    <span className="relative z-10 text-sm font-medium">{step.label}</span>
                  </motion.div>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-text-muted hidden sm:block flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </LayoutGroup>
      </Section>

      {/* ── Workspace: idea + settings rail ── */}
      <Section reduce={reduce}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          {/* Idea canvas */}
          <Card className="xl:col-span-8 relative overflow-hidden">
            <div
              className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-[0.12] pointer-events-none"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-button bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Your story idea</h3>
                    <p className="text-sm text-text-muted mt-0.5">A few lines is enough — the model handles the rest.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(idea.trim() || expandedStory || scenes.length > 0) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Save}
                      onClick={handleSaveProject}
                      loading={saving}
                      disabled={loadingProject}
                    >
                      {currentProject?.id ? 'Save' : 'Save project'}
                    </Button>
                  )}
                  {(expandedStory || scenes.length > 0) && (
                    <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset}>
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              <Input
                label="Story seed"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                multiline
                rows={9}
                maxLength={2000}
                placeholder="A young boy in a small village finds a brass lamp buried under an ancient banyan tree..."
                inputClassName="!text-base !leading-relaxed min-h-[220px]"
              />

              {error && (
                <div className="mt-5">
                  <FriendlyError error={error} />
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-border-subtle">
                <MagneticButton strength={reduce ? 0 : 5} className="w-full max-w-md">
                  <Button
                    onClick={handleExpand}
                    loading={loading}
                    fullWidth
                    size="lg"
                    icon={Sparkles}
                    className="!h-14 !text-base shadow-glow-violet"
                    disabled={!idea.trim()}
                  >
                    {loading ? 'Expanding narrative…' : expandedStory ? 'Re-expand story' : 'Expand into full story'}
                  </Button>
                </MagneticButton>
              </div>
            </div>
          </Card>

          {/* Settings rail */}
          <div className="xl:col-span-4 space-y-5 xl:sticky xl:top-24">
            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Output language</p>
              <EngineToggle
                value={language}
                onChange={setLanguage}
                size="lg"
                options={[
                  { value: 'english', label: 'English' },
                  { value: 'hindi',   label: 'हिन्दी' },
                ]}
              />
            </Card>

            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Target length</p>
              <div className="space-y-2">
                {LENGTHS.map((l) => (
                  <motion.button
                    key={l.key}
                    type="button"
                    onClick={() => setLength(l.key)}
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    className={[
                      'w-full flex items-center justify-between gap-3 px-4 h-14 rounded-button border text-left',
                      'transition-all duration-250 ease-spring',
                      length === l.key
                        ? 'bg-accent/12 border-accent text-text-primary shadow-glow-violet-soft'
                        : 'bg-bg-elevated/50 border-border text-text-secondary hover:border-accent/35 hover:text-text-primary',
                    ].join(' ')}
                  >
                    <div>
                      <p className="text-sm font-semibold">{l.label}</p>
                      <p className="text-xs text-text-muted mt-0.5">{l.sub}</p>
                    </div>
                    {length === l.key && (
                      <motion.span
                        initial={reduce ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                      >
                        <Check className="w-4 h-4 text-accent-glow" />
                      </motion.span>
                    )}
                  </motion.button>
                ))}
              </div>
            </Card>

            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Genre</p>
              <LayoutGroup>
                <div className="grid grid-cols-2 gap-2.5">
                  {GENRES.map((g) => {
                    const selected = genre === g.key
                    return (
                      <motion.button
                        key={g.key}
                        type="button"
                        onClick={() => setGenre(g.key)}
                        whileTap={reduce ? undefined : { scale: 0.97 }}
                        className={[
                          'relative flex flex-col items-start gap-1 px-3.5 py-3 rounded-button border text-left min-h-[72px]',
                          'transition-colors duration-250',
                          selected
                            ? 'border-accent-secondary/60 text-text-primary'
                            : 'border-border bg-bg-elevated/40 text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        {selected && !reduce && (
                          <motion.span
                            layoutId="story-genre-pill"
                            className="absolute inset-0 rounded-button bg-accent-secondary/10 border border-accent-secondary/40"
                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                          />
                        )}
                        <span className="relative z-10 text-lg leading-none">{g.symbol}</span>
                        <span className="relative z-10 text-xs font-semibold">{g.label}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>
            </Card>

            <Card className="overflow-hidden">
              <button
                type="button"
                onClick={() => setBibleOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BookOpen className="w-4 h-4 text-accent-glow flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Continuity bible</p>
                    <p className="text-xs text-text-muted mt-0.5">Optional character & world notes</p>
                  </div>
                  {bible && <Badge color="violet" className="!py-0 flex-shrink-0">set</Badge>}
                </div>
                <motion.span
                  animate={{ rotate: bibleOpen ? 180 : 0 }}
                  transition={{ duration: 0.28, ease: SMOOTH_EASE }}
                  className="flex-shrink-0 text-text-muted"
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {bibleOpen && (
                  <motion.div
                    key="bible"
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.32, ease: SMOOTH_EASE }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 mt-4 border-t border-border-subtle">
                      <textarea
                        value={bible}
                        onChange={(e) => setBible(e.target.value)}
                        rows={4}
                        placeholder="Main character: 10-year-old boy, curly hair, red shirt. Setting: ancient forest with blue magical glow."
                        className="w-full bg-bg-elevated/50 rounded-input border border-border px-3.5 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none leading-relaxed"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            <motion.button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className={[
                'w-full flex items-center justify-between gap-3 px-5 h-14 rounded-[22px] border',
                'transition-all duration-250 ease-spring',
                contextOpen
                  ? 'glass border-accent/40 shadow-glow-violet-soft text-text-primary'
                  : 'glass border-border-subtle text-text-secondary hover:border-accent/30 hover:text-text-primary',
              ].join(' ')}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-accent-glow" />
                <span className="text-sm font-medium">Style context</span>
                <Badge color="muted" className="!py-0">{remembered.length}</Badge>
              </div>
              <motion.span
                animate={{ rotate: contextOpen ? 180 : 0 }}
                transition={{ duration: 0.28, ease: SMOOTH_EASE }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.span>
            </motion.button>
          </div>
        </div>
      </Section>

      {/* Style context panel */}
      <AnimatePresence initial={false}>
        {contextOpen && (
          <motion.div
            key="style-context"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 12 }}
            transition={{ duration: 0.4, ease: SMOOTH_EASE }}
          >
            <StyleContextPanel
              sampleStory={sampleStory}
              styleNotes={styleNotes}
              enableSample={enableSample}
              enableNotes={enableNotes}
              includeMemory={includeMemory}
              language={languageStyle}
              remembered={remembered}
              sampleOpen={sampleOpen}
              notesOpen={notesOpen}
              memoryOpen={memoryOpen}
              setSampleOpen={setSampleOpen}
              setNotesOpen={setNotesOpen}
              setMemoryOpen={setMemoryOpen}
              setSampleStory={setSampleStory}
              setStyleNotes={setStyleNotes}
              setEnableSample={setEnableSample}
              setEnableNotes={setEnableNotes}
              setIncludeMemory={setIncludeMemory}
              setLanguageStyle={setLanguageStyle}
              forgetProject={forgetProject}
              clearMemory={clearMemory}
              resetStyle={resetStyle}
              reduce={reduce}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Output theater ── */}
      <Section reduce={reduce} className="pb-4">
        <Card className="relative overflow-hidden min-h-[320px]">
          <div
            className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-accent/[0.06] to-transparent pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-button bg-bg-elevated border border-border-subtle flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-accent-glow" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-text-primary">Story output</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {scenes.length > 0
                    ? `${scenes.length} scenes ready for storyboard`
                    : expandedStory
                      ? 'Full narrative — break into scenes when ready'
                      : 'Generated content appears here'}
                </p>
              </div>
            </div>
            {scenes.length > 0 && (
              <Badge color="violet">{scenes.length} scenes</Badge>
            )}
          </div>

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 text-sm text-text-secondary mb-2">
                  <Loader2 className="w-4 h-4 animate-spin text-accent-glow" />
                  Crafting your narrative…
                </div>
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-[92%] rounded-md" />
                <Skeleton className="h-4 w-[88%] rounded-md" />
                <Skeleton className="h-4 w-[75%] rounded-md" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <Skeleton className="h-28 rounded-input" />
                  <Skeleton className="h-28 rounded-input" />
                </div>
              </motion.div>
            ) : scenes.length > 0 ? (
              <motion.div
                key="scenes"
                variants={reduce ? undefined : sceneListVariants}
                initial={reduce ? false : 'hidden'}
                animate="visible"
                exit={reduce ? undefined : { opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {scenes.map((scene, i) => (
                  <SceneCard key={i} scene={scene} index={i} reduce={reduce} />
                ))}
                <div className="md:col-span-2 flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    as={Link}
                    to={
                      currentProject?.id
                        ? `/storyboard?project=${currentProject.id}`
                        : '/storyboard'
                    }
                    icon={Clapperboard}
                    size="lg"
                  >
                    Open storyboard
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Save}
                    size="lg"
                    loading={saving}
                    onClick={handleSaveProject}
                  >
                    Save project
                  </Button>
                </div>
              </motion.div>
            ) : expandedStory ? (
              <motion.div
                key="story"
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.55, ease: SMOOTH_EASE }}
                className="space-y-6"
              >
                <div className="p-6 md:p-8 rounded-[20px] bg-bg-elevated/50 border border-border-subtle">
                  <p className="whitespace-pre-wrap text-base md:text-lg text-text-secondary leading-[1.75] font-light">
                    {expandedStory}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
                  <MagneticButton strength={reduce ? 0 : 4} className="flex-1">
                    <Button
                      onClick={handleBreakdown}
                      loading={breakdownLoading}
                      fullWidth
                      size="lg"
                      icon={Layers}
                      className="shadow-glow-violet-soft"
                    >
                      {breakdownLoading ? 'Splitting into scenes…' : 'Break into scenes'}
                    </Button>
                  </MagneticButton>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => { setExpandedStory(''); setScenes([]) }}
                  >
                    Discard
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center py-4"
              >
                <div className="text-center lg:text-left px-2">
                  <motion.div
                    animate={reduce ? undefined : { y: [0, -6, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-16 h-16 mx-auto lg:mx-0 rounded-2xl bg-bg-elevated border border-border flex items-center justify-center mb-5"
                  >
                    <Film className="w-7 h-7 text-text-muted" />
                  </motion.div>
                  <p className="font-display text-lg font-semibold text-text-primary">Your story will land here</p>
                  <p className="text-sm text-text-muted mt-2 leading-relaxed max-w-sm mx-auto lg:mx-0">
                    Write an idea, tune language and length, then expand. Read the full narrative first — scenes come after.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { n: '1', t: 'Seed your idea', d: 'One sentence is enough to start.' },
                    { n: '2', t: 'Expand', d: 'Get a full narrative paragraph.' },
                    { n: '3', t: 'Break into scenes', d: 'Split when you are happy with the story.' },
                  ].map((step, i) => (
                    <motion.div
                      key={step.n}
                      variants={reduce ? undefined : gridItemVariants}
                      initial={reduce ? false : 'hidden'}
                      animate="visible"
                      transition={{ delay: reduce ? 0 : 0.15 + i * 0.08 }}
                      className="flex items-start gap-4 p-4 rounded-input bg-bg-elevated/40 border border-border-subtle"
                    >
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-accent to-[#4F46E5] text-white text-sm font-bold flex items-center justify-center shadow-glow-violet-soft">
                        {step.n}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{step.t}</p>
                        <p className="text-xs text-text-muted mt-1 leading-relaxed">{step.d}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </Section>
    </Root>
  )
}

function SceneCard({ scene, index, reduce }) {
  const inner = (
    <div className="group h-full p-5 rounded-[18px] bg-bg-elevated/60 border border-border-subtle hover:border-accent/35 hover:shadow-glow-violet-soft transition-all duration-300">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-accent text-white text-sm font-bold flex items-center justify-center shadow-glow-violet-soft flex-shrink-0">
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-text-primary truncate">
            {scene.brief_description || 'Untitled scene'}
          </span>
        </div>
        <Badge color="muted" className="flex-shrink-0">
          <Clock className="w-3 h-3" />
          {scene.estimated_duration_seconds}s
        </Badge>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed mb-4 line-clamp-4">
        {scene.detailed_action}
      </p>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-pill bg-bg-base/50 border border-border-subtle">
          <Sparkles className="w-3 h-3 text-accent-glow" />
          {scene.mood}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-pill bg-bg-base/50 border border-border-subtle">
          <Camera className="w-3 h-3" />
          {scene.suggested_camera_angle}
        </span>
      </div>
    </div>
  )

  if (reduce) return <div>{inner}</div>
  return (
    <motion.div variants={sceneCardVariants} layout>
      {inner}
    </motion.div>
  )
}

function StyleContextPanel({
  sampleStory, styleNotes,
  enableSample, enableNotes, includeMemory,
  language,
  remembered,
  sampleOpen, notesOpen, memoryOpen,
  setSampleOpen, setNotesOpen, setMemoryOpen,
  setSampleStory, setStyleNotes,
  setEnableSample, setEnableNotes, setIncludeMemory,
  setLanguageStyle,
  forgetProject, clearMemory, resetStyle,
  reduce,
}) {
  const isDefaultStyle =
    sampleStory === DEFAULT_SAMPLE_STORY && styleNotes === DEFAULT_STYLE_NOTES

  return (
    <Card className="border-accent/30 bg-accent/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-button bg-accent/15 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-accent-glow" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold text-text-primary">दादाजी style context</h3>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              3 reference stories + viral formula — sent on every Expand call when toggles are ON.
            </p>
          </div>
        </div>
        {!isDefaultStyle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Reset sample + formula to दादाजी defaults? Your edits will be replaced.')) {
                resetStyle()
              }
            }}
          >
            Reset defaults
          </Button>
        )}
      </div>

      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-input bg-bg-elevated/40 border border-border-subtle">
          <div>
            <p className="text-sm font-medium text-text-primary">Output language (model)</p>
            <p className="text-xs text-text-muted mt-1">Separate from the story language toggle above.</p>
          </div>
          <CustomSelect
            value={language || 'hindi'}
            onChange={(v) => setLanguageStyle(v)}
            align="right"
            options={[
              { value: 'hindi',   label: 'हिन्दी (Hindi)' },
              { value: 'english', label: 'English' },
              { value: 'hinglish',label: 'Hinglish' },
              { value: 'tamil',   label: 'தமிழ் (Tamil)' },
              { value: 'telugu',  label: 'తెలుగు (Telugu)' },
              { value: 'bengali', label: 'বাংলা (Bengali)' },
              { value: 'marathi', label: 'मराठी (Marathi)' },
            ]}
          />
        </div>

        <ContextBlock
          icon={BookOpen}
          title="Reference samples (×3)"
          description="जादुई मोबाइल + मिट्टी + कैमरा — match tone, pacing, length, and like/subscribe ending."
          enabled={enableSample}
          onToggle={(v) => setEnableSample(v)}
          open={sampleOpen}
          setOpen={setSampleOpen}
          value={sampleStory}
          onChange={setSampleStory}
          rows={10}
          mono={false}
          characterCount
          reduce={reduce}
        />

        <ContextBlock
          icon={Settings2}
          title="Viral formula"
          description="8-scene दादाजी structure: hook → magic → proof → village help → villain → punishment → return → like/subscribe."
          enabled={enableNotes}
          onToggle={(v) => setEnableNotes(v)}
          open={notesOpen}
          setOpen={setNotesOpen}
          value={styleNotes}
          onChange={setStyleNotes}
          rows={12}
          mono
          reduce={reduce}
        />

        <div className={[
          'rounded-[18px] border overflow-hidden transition-colors duration-300',
          includeMemory ? 'border-accent/40 bg-bg-elevated/80' : 'border-border-subtle bg-bg-base/25',
        ].join(' ')}>
          <ContextRowHeader
            icon={History}
            title="Project memory"
            badge={remembered.length}
            enabled={includeMemory}
            open={memoryOpen}
            onOpenToggle={() => setMemoryOpen((v) => !v)}
            onEnableToggle={() => setIncludeMemory(!includeMemory)}
            reduce={reduce}
            extra={
              <span className="text-[10px] text-text-muted uppercase tracking-wider hidden sm:inline">
                include
              </span>
            }
          />
          <AnimatePresence initial={false}>
            {memoryOpen && (
              <motion.div
                key="mem"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.32, ease: SMOOTH_EASE }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 border-t border-border-subtle pt-4">
                  {remembered.length === 0 ? (
                    <p className="text-sm text-text-muted leading-relaxed">
                      No projects remembered yet. After you generate a story, summaries are saved for future style context.
                    </p>
                  ) : (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {remembered.map((p) => (
                        <div
                          key={p.id}
                          className="group flex items-start gap-3 p-3.5 rounded-button bg-bg-base/40 border border-border-subtle hover:border-accent/25 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary font-medium truncate">{p.idea || '(untitled)'}</p>
                            {p.summary && (
                              <p className="text-xs text-text-muted line-clamp-2 mt-1 leading-relaxed">{p.summary}</p>
                            )}
                            <p className="text-[10px] text-text-muted mt-1.5 font-mono">
                              {new Date(p.createdAt).toLocaleString()}
                              {p.provider && p.provider !== 'auto' ? ` · ${p.provider}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => forgetProject(p.id)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors opacity-0 group-hover:opacity-100 hover-reveal"
                            title="Forget this project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {remembered.length > 0 && (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Clear all remembered projects? This cannot be undone.')) clearMemory()
                        }}
                        className="text-xs text-text-muted hover:text-status-error transition-colors inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear all memory
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-xs text-text-muted leading-relaxed px-1">
          Keep both toggles ON for दादाजी-style stories. Turn off only for one-off experiments.
          Model output language defaults to हिन्दी (Devanagari).
        </p>
      </div>
    </Card>
  )
}

function ContextSwitch({ enabled, onChange, reduce, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onChange}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-pill overflow-hidden',
        'border transition-colors duration-250',
        enabled ? 'bg-accent border-accent' : 'bg-bg-base border-border-subtle',
      ].join(' ')}
    >
      <motion.span
        aria-hidden="true"
        className="inline-block h-4 w-4 rounded-full bg-white shadow flex-shrink-0"
        animate={{ x: enabled ? 16 : 2 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  )
}

function ContextRowHeader({
  icon: Icon,
  title,
  badge,
  enabled,
  open,
  onOpenToggle,
  onEnableToggle,
  reduce,
  extra,
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <button
        type="button"
        onClick={onOpenToggle}
        className="flex items-center gap-3 min-w-0 text-left group"
      >
        <span
          className={[
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-250',
            enabled ? 'bg-accent/15 border border-accent/25' : 'bg-bg-base/50 border border-border-subtle',
          ].join(' ')}
        >
          <Icon className={['w-4 h-4', enabled ? 'text-accent-glow' : 'text-text-muted'].join(' ')} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span
              className={[
                'text-sm font-medium truncate',
                enabled ? 'text-text-primary' : 'text-text-muted group-hover:text-text-secondary',
              ].join(' ')}
            >
              {title}
            </span>
            {badge != null && badge > 0 && (
              <Badge color="muted" className="!py-0 flex-shrink-0">{badge}</Badge>
            )}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.28, ease: SMOOTH_EASE }}
          className="text-text-muted group-hover:text-text-secondary flex-shrink-0"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        {extra}
        <ContextSwitch
          enabled={enabled}
          onChange={onEnableToggle}
          reduce={reduce}
          label={`${title} enabled`}
        />
      </div>
    </div>
  )
}

function ContextBlock({
  icon, title, description, enabled, onToggle,
  open, setOpen, value, onChange, rows = 5,
  mono = true, characterCount = false, reduce,
}) {
  return (
    <div
      className={[
        'rounded-[18px] border overflow-hidden transition-colors duration-300',
        enabled ? 'border-accent/40 bg-bg-elevated/80' : 'border-border-subtle bg-bg-base/25',
      ].join(' ')}
    >
      <ContextRowHeader
        icon={icon}
        title={title}
        enabled={enabled}
        open={open}
        onOpenToggle={() => setOpen((v) => !v)}
        onEnableToggle={() => onToggle(!enabled)}
        reduce={reduce}
      />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: SMOOTH_EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border-subtle pt-4">
              {description && (
                <p className="text-xs text-text-muted mb-3 leading-relaxed">{description}</p>
              )}
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={rows}
                disabled={!enabled}
                className={[
                  'w-full bg-bg-base/50 rounded-input border border-border-subtle px-3.5 py-3 text-sm text-text-primary',
                  'placeholder:text-text-muted focus:outline-none focus:border-accent resize-y leading-relaxed',
                  mono ? 'font-mono' : '',
                  !enabled ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              />
              {characterCount && (
                <p className="text-[10px] text-text-muted mt-2 text-right font-mono">{value.length} chars</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
