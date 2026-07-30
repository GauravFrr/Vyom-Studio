import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Download, Film, Sparkles, Music, Subtitles, Image as ImageIcon,
  Video, Check, Volume2, FileArchive, Clock, Layers, Ratio, Clapperboard,
  ArrowRight,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import ProgressBar from '../components/ui/ProgressBar'
import MagneticButton from '../components/MagneticButton'
import { useToast } from '../components/ui/Toast'
import FriendlyError from '../components/ui/FriendlyError'
import { exportApi, resolveMediaUrl } from '../api/client'
import useProjectStore from '../store/projectStore'
import useSettingsStore from '../store/settingsStore'
import { readVoiceoverForExport } from '../utils/sceneAssets'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

const TRANSITIONS = [
  { key: 'cut', label: 'Cut', desc: 'Hard cut between scenes' },
  { key: 'fade', label: 'Fade', desc: 'Fade to black' },
  { key: 'dissolve', label: 'Dissolve', desc: 'Cross-dissolve' },
  { key: 'wipe', label: 'Wipe', desc: 'Directional wipe' },
]

const ASPECT_PRESETS = [
  { key: '9:16', label: '9:16', sub: 'Shorts · 1080×1920' },
  { key: '16:9', label: '16:9', sub: 'Wide · 1920×1080' },
  { key: '1:1', label: '1:1', sub: 'Square · 1080×1080' },
  { key: '4:5', label: '4:5', sub: 'Portrait · 1080×1350' },
]

const EXPORT_TABS = [
  { value: 'assemble', label: 'Assemble', icon: Film },
  { value: 'images', label: 'Images ZIP', icon: ImageIcon },
  { value: 'clips', label: 'Clips ZIP', icon: Video },
  { value: 'project', label: 'Project JSON', icon: FileArchive },
]

const pageStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: SMOOTH_EASE },
  },
}

const revealVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: SMOOTH_EASE },
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
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-[18px] bg-bg-elevated/50 border border-border-subtle h-full min-w-0">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="font-display text-sm font-bold text-text-primary truncate leading-tight">{value}</p>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  )
  if (reduce) return <div>{inner}</div>
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

export default function ExportPage() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const scenes = useProjectStore((s) => s.scenes)
  const currentProject = useProjectStore((s) => s.currentProject)
  const approved = scenes.filter((s) => s.status === 'approved')
  const exportable = approved.filter(
    (s) => s.video_url || s.video_path || s.image_url || s.image_path,
  )

  const settings = useSettingsStore.getState()
  const [transition, setTransition] = useState(settings.exportDefaultTransition || 'fade')
  const [aspect, setAspect] = useState(settings.exportDefaultAspect || '9:16')
  const [music, setMusic] = useState(null)
  const [voiceover, setVoiceover] = useState(settings.exportIncludeAudio ?? false)
  const [subtitles, setSubtitles] = useState(settings.exportIncludeSubtitles ?? true)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [resultUrl, setResultUrl] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('assemble')
  const musicInputRef = useRef(null)

  const totalDuration = approved.reduce(
    (acc, s) => acc + (s.duration_sec || s.estimated_duration_seconds || 4),
    0
  )

  const handleAssemble = async () => {
    if (approved.length === 0) {
      toast({ kind: 'error', title: 'No approved scenes', message: 'Approve at least one scene in Storyboard first.' })
      return
    }
    if (exportable.length === 0) {
      toast({
        kind: 'error',
        title: 'No scene media',
        message: 'Approved scenes need an image or video clip before export.',
      })
      return
    }

    setExporting(true)
    setProgress(0)
    setDone(false)
    setResultUrl(null)
    setError('')

    const tick = setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + 2))
    }, 400)

    const savedVoice = voiceover ? readVoiceoverForExport() : null

    try {
      const res = await exportApi.assembleVideo(
        {
          scenes: exportable.map((s) => ({
            scene_number: s.scene_number,
            video_url: s.video_url,
            video_path: s.video_path,
            image_url: s.image_url,
            image_path: s.image_path,
            duration_sec: s.duration_sec || s.estimated_duration_seconds || 4,
            brief_description: s.brief_description,
          })),
          project_id: currentProject?.id || undefined,
          aspect_ratio: aspect,
          transition,
          transition_duration: settings.exportDefaultTransitionDuration || 0.5,
          voiceover_url: savedVoice?.audio_url || undefined,
          include_voiceover: voiceover,
          include_subtitles: subtitles,
        },
        { music: music || undefined },
      )

      if (res.data?.success && res.data?.video_url) {
        const url = resolveMediaUrl(res.data.video_url)
        setResultUrl(url)
        setDone(true)
        setProgress(100)
        toast({
          kind: 'success',
          title: 'Video ready',
          message: `${res.data.scene_count || exportable.length} scenes · ${res.data.duration_seconds || totalDuration}s`,
        })
      } else {
        setError(res.data?.detail || res.data?.message || 'Export failed.')
      }
    } catch (e) {
      const detail = e?.response?.data?.detail
      setError(detail ? String(detail) : 'Export failed. Check that FFmpeg is installed.')
    } finally {
      clearInterval(tick)
      setExporting(false)
    }
  }

  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-10 lg:space-y-12 pb-6' }
    : {
        className: 'space-y-10 lg:space-y-12 pb-6',
        initial: 'hidden',
        animate: 'visible',
        variants: pageStagger,
      }

  return (
    <Root {...rootProps}>
      {/* Hero */}
      <Section reduce={reduce}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-5">
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-status-success animate-pulse" />
          Final delivery
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Export your <span className="text-gradient-violet">Short</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Stitch approved scenes into a YouTube-ready MP4 — transitions, voiceover, captions, and bulk ZIP exports.
        </p>
      </Section>

      {/* Stats */}
      <Section reduce={reduce}>
        <motion.div
          variants={reduce ? undefined : { visible: { transition: { staggerChildren: 0.08 } } }}
          initial={reduce ? false : 'hidden'}
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4"
        >
          <StatPill icon={Layers} label="Approved" value={approved.length} accent="#7C3AED" reduce={reduce} />
          <StatPill icon={Clock} label="Runtime" value={`${totalDuration}s`} accent="#3B82F6" reduce={reduce} />
          <StatPill icon={Ratio} label="Aspect" value={aspect} accent="#06B6D4" reduce={reduce} />
          <StatPill
            icon={Clapperboard}
            label="Status"
            value={approved.length > 0 ? 'Ready' : 'Pending'}
            accent={approved.length > 0 ? '#10B981' : '#F59E0B'}
            reduce={reduce}
          />
        </motion.div>
      </Section>

      {/* Tab bar */}
      <Section reduce={reduce}>
        <Card className="relative overflow-hidden">
          <div
            className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-[0.1] pointer-events-none bg-violet-600"
            aria-hidden="true"
          />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-text-primary">Export modes</h3>
              <p className="text-xs text-text-muted mt-0.5">Untitled project · {scenes.length} total scenes</p>
            </div>
            {approved.length === 0 && (
              <Button as={Link} to="/storyboard" variant="ghost" size="sm" icon={ArrowRight}>
                Approve scenes
              </Button>
            )}
          </div>
          <LayoutGroup>
            <div className="relative flex flex-wrap gap-2 mt-4">
              {EXPORT_TABS.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.value
                return (
                  <motion.button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
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
                        layoutId="export-tab-pill"
                        className="absolute inset-0 rounded-pill bg-accent/12 border border-accent/35"
                        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                      />
                    )}
                    <Icon className="relative z-10 w-3.5 h-3.5" />
                    <span className="relative z-10">{tab.label}</span>
                  </motion.button>
                )
              })}
            </div>
          </LayoutGroup>
        </Card>
      </Section>

      {/* Tab content */}
      <Section reduce={reduce}>
        <AnimatePresence mode="wait">
          {activeTab === 'assemble' ? (
            <motion.div
              key="assemble"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.4, ease: SMOOTH_EASE }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start"
            >
              {/* Settings rail */}
              <div className="xl:col-span-7 space-y-5">
                <Card>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Aspect ratio</p>
                  <LayoutGroup>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      {ASPECT_PRESETS.map((p) => {
                        const selected = aspect === p.key
                        return (
                          <motion.button
                            key={p.key}
                            type="button"
                            onClick={() => setAspect(p.key)}
                            whileTap={reduce ? undefined : { scale: 0.98 }}
                            className={[
                              'relative flex flex-col items-start justify-center px-3.5 h-[72px] rounded-[14px] border text-left',
                              selected ? 'border-accent/50 text-text-primary' : 'border-border-subtle text-text-secondary hover:border-accent/30',
                            ].join(' ')}
                          >
                            {selected && !reduce && (
                              <motion.span
                                layoutId="export-aspect-pill"
                                className="absolute inset-0 rounded-[14px] bg-accent/12 border border-accent/35"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              />
                            )}
                            <span className="relative z-10 text-sm font-semibold">{p.label}</span>
                            <span className="relative z-10 text-[10px] text-text-muted mt-0.5">{p.sub}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </LayoutGroup>
                </Card>

                <Card>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Scene transitions</p>
                  <LayoutGroup>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      {TRANSITIONS.map((t) => {
                        const selected = transition === t.key
                        return (
                          <motion.button
                            key={t.key}
                            type="button"
                            onClick={() => setTransition(t.key)}
                            whileTap={reduce ? undefined : { scale: 0.98 }}
                            className={[
                              'relative flex flex-col items-start p-3.5 min-h-[72px] rounded-[14px] border text-left',
                              selected ? 'border-accent/50 text-text-primary' : 'border-border-subtle text-text-secondary hover:border-accent/30',
                            ].join(' ')}
                          >
                            {selected && !reduce && (
                              <motion.span
                                layoutId="export-transition-pill"
                                className="absolute inset-0 rounded-[14px] bg-accent/12 border border-accent/35"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              />
                            )}
                            <span className="relative z-10 text-sm font-semibold">{t.label}</span>
                            <span className="relative z-10 text-[10px] text-text-muted mt-0.5">{t.desc}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </LayoutGroup>
                </Card>

                <Card>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Audio</p>
                  <div className="space-y-5">
                    <FileRow
                      icon={Music}
                      title="Background music"
                      description="Auto-loops under voiceover. MP3 up to 50MB."
                      file={music}
                      inputRef={musicInputRef}
                      onPick={(file) => setMusic(file)}
                      onClear={() => setMusic(null)}
                    />
                    <ToggleRow
                      icon={Volume2}
                      label="Include voiceover"
                      description="Uses the latest voiceover from the Voiceover page"
                      checked={voiceover}
                      onChange={setVoiceover}
                    />
                  </div>
                </Card>

                <Card>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Subtitles</p>
                  <ToggleRow
                    icon={Subtitles}
                    label="Burn captions into video"
                    description="Renders voiceover text as subtitles on each scene"
                    checked={subtitles}
                    onChange={setSubtitles}
                  />
                </Card>
              </div>

              {/* Assemble theater */}
              <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-28">
                <Card className="relative overflow-hidden min-h-[320px]">
                  <div
                    className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-accent/[0.06] to-transparent pointer-events-none"
                    aria-hidden="true"
                  />
                  <div className="relative flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-button bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft">
                      <Film className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-text-primary">Assemble theater</h3>
                      <p className="text-sm text-text-muted mt-0.5">H.264 MP4 · YouTube Shorts</p>
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-bg-elevated/50 border border-border-subtle p-4 mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] text-text-muted uppercase tracking-widest">Timeline</span>
                      <span className="text-xs font-mono text-accent-glow">{totalDuration}s</span>
                    </div>
                    {error && (
                      <div className="mb-4">
                        <FriendlyError error={error} />
                      </div>
                    )}
                    {approved.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-sm text-text-muted mb-3">No approved scenes yet.</p>
                        <Button as={Link} to="/storyboard" variant="ghost" size="sm" icon={ArrowRight}>
                          Go to Storyboard
                        </Button>
                      </div>
                    ) : (
                      <motion.div
                        className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {approved.map((s, i) => {
                          const dur = s.duration_sec || s.estimated_duration_seconds || 4
                          return (
                            <motion.div
                              key={s.id || i}
                              initial={reduce ? false : { opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: reduce ? 0 : i * 0.05, duration: 0.4, ease: SMOOTH_EASE }}
                              className="h-10 rounded-lg bg-gradient-to-br from-accent to-[#4F46E5] flex-shrink-0 flex items-center justify-center text-[10px] font-mono text-white/90 shadow-glow-violet-soft"
                              style={{ width: `${Math.max(28, dur * 12)}px` }}
                              title={`${dur}s · ${s.brief_description || ''}`}
                            >
                              {i + 1}
                            </motion.div>
                          )
                        })}
                      </motion.div>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    {exporting ? (
                      <motion.div
                        key="loading"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduce ? undefined : { opacity: 0 }}
                        className="space-y-4"
                      >
                        <ProgressBar value={progress} indeterminate={progress < 5} />
                        <p className="text-sm text-text-secondary text-center">
                          Assembling {exportable.length} scene{exportable.length === 1 ? '' : 's'}…
                        </p>
                      </motion.div>
                    ) : done ? (
                      <motion.div
                        key="done"
                        variants={reduce ? undefined : revealVariants}
                        initial={reduce ? false : 'hidden'}
                        animate="visible"
                        className="space-y-4"
                      >
                        <div className="p-4 rounded-[18px] bg-status-success/10 border border-status-success/30 text-sm text-status-success flex items-center gap-2">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          Render complete — ready to download.
                        </div>
                        {resultUrl && (
                          <div className="rounded-[18px] overflow-hidden border border-border-subtle bg-black aspect-[9/16] max-h-[320px] mx-auto mb-4">
                            <video src={resultUrl} controls className="w-full h-full object-contain" playsInline />
                          </div>
                        )}
                        <MagneticButton strength={reduce ? 0 : 4} className="w-full">
                          <Button
                            fullWidth
                            icon={Download}
                            size="lg"
                            className="!h-14"
                            onClick={() => {
                              if (!resultUrl) return
                              const a = document.createElement('a')
                              a.href = resultUrl
                              a.download = `vyom-short-${Date.now()}.mp4`
                              a.target = '_blank'
                              a.rel = 'noopener noreferrer'
                              a.click()
                            }}
                          >
                            Download MP4
                          </Button>
                        </MagneticButton>
                      </motion.div>
                    ) : (
                      <motion.div key="idle" initial={false} animate={{ opacity: 1 }}>
                        <MagneticButton strength={reduce ? 0 : 5} className="w-full">
                          <Button
                            onClick={handleAssemble}
                            fullWidth
                            size="lg"
                            icon={Sparkles}
                            className="!h-14 shadow-glow-violet"
                            disabled={exportable.length === 0}
                          >
                            Assemble video
                          </Button>
                        </MagneticButton>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>

                <Card>
                  <h3 className="font-display text-sm font-semibold text-text-primary mb-4">Output spec</h3>
                  <div className="space-y-0">
                    <SpecRow label="Codec" value="H.264" />
                    <SpecRow label="Quality" value="High · CRF 18" />
                    <SpecRow label="Audio" value="AAC · 192kbps" />
                    <SpecRow label="Transition" value={transition} />
                    <SpecRow label="Format" value="MP4" />
                  </div>
                </Card>
              </div>
            </motion.div>
          ) : activeTab === 'images' ? (
            <motion.div
              key="images"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.4, ease: SMOOTH_EASE }}
            >
              <Card className="min-h-[280px] flex items-center justify-center">
                <EmptyState
                  icon={ImageIcon}
                  title="Export all scene images"
                  description="Bundle every generated scene image into a single ZIP, named by scene number."
                  action={
                    <MagneticButton strength={reduce ? 0 : 4}>
                      <Button icon={Download} size="lg">Download images.zip</Button>
                    </MagneticButton>
                  }
                />
              </Card>
            </motion.div>
          ) : activeTab === 'clips' ? (
            <motion.div
              key="clips"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.4, ease: SMOOTH_EASE }}
            >
              <Card className="min-h-[280px] flex items-center justify-center">
                <EmptyState
                  icon={Video}
                  title="Export all video clips"
                  description="Bundle every approved video clip into a single ZIP, named by scene number."
                  action={
                    <MagneticButton strength={reduce ? 0 : 4}>
                      <Button icon={Download} size="lg">Download clips.zip</Button>
                    </MagneticButton>
                  }
                />
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="project"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.4, ease: SMOOTH_EASE }}
            >
              <Card className="min-h-[280px] flex items-center justify-center">
                <EmptyState
                  icon={FileArchive}
                  title="Export project as JSON"
                  description="Full project backup — story, scenes, prompts, and asset references. Re-importable in a future session."
                  action={
                    <MagneticButton strength={reduce ? 0 : 4}>
                      <Button icon={Download} size="lg">Download project.json</Button>
                    </MagneticButton>
                  }
                />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>
    </Root>
  )
}

function SpecRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-mono text-xs">{value}</span>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, description, checked, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-button bg-accent/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-accent-glow" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium">{label}</p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={[
          'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-pill overflow-hidden border transition-colors duration-200',
          checked ? 'bg-accent border-accent' : 'bg-bg-base border-border-subtle',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

function FileRow({ icon: Icon, title, description, file, onPick, onClear, inputRef }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-button bg-accent/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-accent-glow" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium">{title}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
        {file && (
          <p className="text-xs text-status-success mt-1.5 font-mono truncate">✓ {file.name}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onPick(f)
          }}
        />
        {file ? (
          <Button variant="ghost" size="sm" onClick={onClear}>Remove</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => inputRef?.current?.click()}>
            Choose
          </Button>
        )}
      </div>
    </div>
  )
}
