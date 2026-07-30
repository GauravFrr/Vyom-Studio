import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Video, Sparkles, Upload, Image as ImageIcon, Camera, Play, Pause,
  Volume2, VolumeX, Maximize2, Download, Clock, Wand2, Move, ZoomIn,
  ChevronDown, Settings2, RefreshCw, Film, Layers, Smartphone,
} from 'lucide-react'
import { generateApi, resolveMediaUrl } from '../api/client'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import EngineToggle from '../components/ui/EngineToggle'
import EmptyState from '../components/ui/EmptyState'
import ProgressBar from '../components/ui/ProgressBar'
import MagneticButton from '../components/MagneticButton'
import { useToast } from '../components/ui/Toast'
import useSettingsStore from '../store/settingsStore'
import useProjectStore from '../store/projectStore'
import SceneLinkBanner from '../components/SceneLinkBanner'
import {
  SCENE_ANIMATE_HANDOFF_KEY,
  attachSceneAssetAndMaybePersist,
  clearSceneHandoff,
  mediaPathForStorage,
  isPersistedMediaPath,
  readSceneHandoff,
} from '../utils/sceneAssets'
import useMotionPreference from '../hooks/useMotionPreference'
import FriendlyError from '../components/ui/FriendlyError'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

const VIDEO_ENGINE_LABELS = {
  veo3: 'VEO 3',
  grok: 'Grok',
  ltx: 'LTX-Video',
  cog: 'CogVideoX',
}

const VEO_MODELS = [
  { value: '3.1', label: 'VEO 3.1' },
  { value: '2.0', label: 'VEO 2.0' },
  { value: 'seedance-2.0', label: 'Seedance 2.0' },
  { value: 'seedance', label: 'Seedance 1' },
]

const GROK_MODELS = [
  { value: 'grok-4', label: 'Grok 4' },
  { value: 'grok-4.5', label: 'Grok 4.5' },
]

const VEO_ASPECTS = [
  { value: '9:16', label: '9:16 Shorts', hint: 'Vertical · YouTube Shorts / Reels' },
  { value: '16:9', label: '16:9 Wide', hint: 'Horizontal · landscape' },
]

/** Shorts-focused clip lengths (VEO free tier is ~4s; 5–6s guides the motion prompt). */
const DURATIONS = [4, 5, 6]

const ENGINES = [
  { value: 'veo3', label: 'VEO 3' },
  { value: 'grok', label: 'Grok' },
  { value: 'ltx', label: 'LTX' },
  { value: 'cog', label: 'CogVideoX' },
]

const CAMERA_MOVES = [
  { key: 'static', label: 'Static', icon: Pause },
  { key: 'pan_l', label: 'Pan L', icon: Move },
  { key: 'pan_r', label: 'Pan R', icon: Move },
  { key: 'zoom_in', label: 'Zoom In', icon: ZoomIn },
  { key: 'zoom_out', label: 'Zoom Out', icon: ZoomIn },
  { key: 'tilt_u', label: 'Tilt Up', icon: Move },
  { key: 'tilt_d', label: 'Tilt Down', icon: Move },
]

const FPS = [16, 24]
const INTENSITY = [
  { value: 0.3, label: 'Subtle' },
  { value: 0.6, label: 'Normal' },
  { value: 1.0, label: 'Dramatic' },
]
const INTENSITY_FROM_SETTING = { low: 0.3, medium: 0.6, high: 1.0 }

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

const gridStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

const revealVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
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

function cameraLabel(key) {
  return CAMERA_MOVES.find((m) => m.key === key)?.label || key.replace('_', ' ')
}

export default function VideoGenerator() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const settings = useSettingsStore.getState()

  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [motionPrompt, setMotionPrompt] = useState('')
  const [camera, setCamera] = useState(settings.videoDefaultCameraMovement || 'static')
  const [duration, setDuration] = useState(settings.videoDefaultDuration || 4)
  const [fps, setFps] = useState(settings.videoDefaultFps || 24)
  const [intensity, setIntensity] = useState(
    INTENSITY_FROM_SETTING[settings.videoDefaultIntensity] ?? 0.6
  )
  const [engine, setEngine] = useState(settings.videoDefaultEngine || 'ltx')
  const [veoModel, setVeoModel] = useState(settings.veoModelVersion || '3.1')
  const [grokModel, setGrokModel] = useState(settings.grokModelVersion || 'grok-4')
  const [veoAspect, setVeoAspect] = useState(settings.videoDefaultAspect || '9:16')
  const [loop, setLoop] = useState(settings.videoDefaultLoop ?? false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [seed, setSeed] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [videoLoadError, setVideoLoadError] = useState('')
  const [linkedScene, setLinkedScene] = useState(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    const payload = readSceneHandoff(SCENE_ANIMATE_HANDOFF_KEY)
    if (!payload) return
    clearSceneHandoff(SCENE_ANIMATE_HANDOFF_KEY)
    if (payload.scene_id) {
      setLinkedScene({
        id: payload.scene_id,
        scene_number: payload.scene_number,
        label: payload.label,
      })
    }
    if (payload.image_url) setImagePreview(resolveMediaUrl(payload.image_url))
    if (payload.motion_prompt) setMotionPrompt(payload.motion_prompt)
    if (payload.engine) setEngine(payload.engine)
    if (payload.veo_model) setVeoModel(payload.veo_model)
    if (payload.grok_model) setGrokModel(payload.grok_model)
  }, [])

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast({ kind: 'error', title: 'Invalid file', message: 'Please drop an image file (PNG, JPG, WebP).' })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ kind: 'error', title: 'File too large', message: 'Max 10MB.' })
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const isVeo = engine === 'veo3' || engine === 'veo'
  const isGrok = engine === 'grok'
  const isSeedance = isVeo && String(veoModel).toLowerCase().includes('seedance')
  const isVeoPhoto = isVeo && !isSeedance
  const isCloudVideo = isVeo || isGrok
  const pollWait = isVeoPhoto ? 60 : (settings.veoPollSeconds || 85)
  const activeModel = isGrok ? grokModel : veoModel
  const isPortrait = veoAspect === '9:16'
  const previewAspectClass = isPortrait
    ? 'aspect-[9/16] w-full max-w-[min(100%,320px)] mx-auto'
    : 'aspect-video w-full max-h-[480px]'

  const handleEnhancePrompt = async () => {
    const idea = motionPrompt.trim()
    if (!idea) {
      toast({ kind: 'violet', title: 'Add a prompt first', message: 'Type a rough idea, then tap Enhance.' })
      return
    }
    setEnhancing(true)
    setError('')
    try {
      const res = await generateApi.enhancePromptVeo({
        idea,
        engine: isGrok ? 'grok' : (settings.promptEnhanceEngine || 'veo'),
        grok_model: isGrok ? grokModel : undefined,
      })
      const text = res.data?.prompt || res.data?.enhanced_prompt || res.data?.text
      if (text) {
        setMotionPrompt(text)
        toast({ kind: 'success', title: 'Prompt enhanced', message: 'Cinematic wording applied.' })
      } else {
        setError(res.data?.detail || 'Enhance returned no text.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Prompt enhance failed.')
    } finally {
      setEnhancing(false)
    }
  }

  const handleGenerate = async () => {
    if ((isVeoPhoto || (!isVeo && !isGrok)) && !imagePreview) {
      toast({
        kind: 'violet',
        title: 'Image required',
        message: isVeoPhoto
          ? 'Upload the scene still — VEO image-to-video needs a starting frame.'
          : 'Drop or pick a starting image first.',
      })
      return
    }
    if (!motionPrompt.trim()) {
      toast({ kind: 'violet', title: 'Animation prompt required', message: 'Describe how the scene should move (paste from GPT/Claude or type here).' })
      return
    }
    const minLen = isVeoPhoto ? 10 : 15
    if (isCloudVideo && motionPrompt.trim().length < minLen) {
      toast({
        kind: 'violet',
        title: 'Prompt too short',
        message: isVeoPhoto
          ? 'Animation prompt needs at least 10 characters.'
          : `${isGrok ? 'Grok' : 'VEO'} text-to-video requires at least 15 characters.`,
      })
      return
    }
    setLoading(true)
    setError('')
    setVideoLoadError('')
    try {
      const res = await generateApi.generateVideo({
        image: isVeoPhoto || (!isVeo && !isGrok) ? imagePreview : undefined,
        motion_prompt: motionPrompt,
        camera_movement: camera,
        duration_seconds: duration,
        fps,
        motion_intensity: intensity,
        engine,
        aspect_ratio: veoAspect,
        veo_model: isGrok ? grokModel : (isVeo ? veoModel : undefined),
        veo_poll_seconds: isCloudVideo ? pollWait : undefined,
        loop,
        seed: seed || undefined,
      })
      if (res.data?.success) {
        const storagePath = mediaPathForStorage(res.data.video_url || res.data.video_path)
        const videoUrl = resolveMediaUrl(storagePath)
        if (!isPersistedMediaPath(storagePath)) {
          setError('Video was created but could not be saved for playback. Please try again.')
          return
        }
        const item = {
          ...res.data,
          video_url: videoUrl,
          motion_prompt: motionPrompt,
          engine,
          veoModel: isGrok ? grokModel : (isVeo ? veoModel : undefined),
          duration,
          aspect: veoAspect,
          createdAt: new Date(),
        }
        setCurrent(item)
        setHistory((h) => [item, ...h].slice(0, 12))

        if (linkedScene?.id) {
          const store = useProjectStore.getState()
          const persist = await attachSceneAssetAndMaybePersist(
            linkedScene.id,
            {
              video_url: storagePath,
              video_path: res.data.video_path,
              motion_prompt: motionPrompt.trim(),
            },
            store,
          )
          toast({
            kind: persist.ok ? 'success' : 'info',
            title: `Scene ${linkedScene.scene_number ?? ''} clip ready`,
            message: persist.ok
              ? 'Storyboard updated and project saved to SQLite.'
              : 'Storyboard updated — Save project in Story Editor to persist after refresh.',
          })
        } else {
          toast({ kind: 'success', title: 'Clip ready', message: `${VIDEO_ENGINE_LABELS[engine] || engine}` })
        }
      } else {
        setError(res.data?.message || res.data?.detail || 'Video generation failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Video generation failed.')
    } finally {
      setLoading(false)
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
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-status-info animate-pulse" />
          Motion engine
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Bring frames <span className="text-gradient-violet">to life</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          VEO 3, LTX, or CogVideoX — turn storyboard stills into Shorts-ready clips with camera moves and motion prompts.
        </p>
      </Section>

      {/* Quick stats */}
      <Section reduce={reduce}>
        <motion.div
          variants={reduce ? undefined : gridStagger}
          initial={reduce ? false : 'hidden'}
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4"
        >
          <QuickStat icon={Film} label="Engine" value={VIDEO_ENGINE_LABELS[engine] || engine} accent="#7C3AED" reduce={reduce} />
          <QuickStat icon={Smartphone} label="Format" value={`${veoAspect} · ${duration}s`} accent="#3B82F6" reduce={reduce} />
          <QuickStat icon={Camera} label="Camera" value={cameraLabel(camera)} accent="#06B6D4" reduce={reduce} />
          <QuickStat icon={Layers} label="History" value={history.length} accent="#F59E0B" reduce={reduce} />
        </motion.div>
      </Section>

      {linkedScene && (
        <Section reduce={reduce}>
          <SceneLinkBanner
            sceneNumber={linkedScene.scene_number}
            label={linkedScene.label}
            onClear={() => setLinkedScene(null)}
          />
        </Section>
      )}

      {/* Workspace */}
      <Section reduce={reduce}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          {/* Controls rail */}
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-28">
            {/* Source image */}
            <Card className="relative overflow-hidden">
              <div
                className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-[0.12] pointer-events-none"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}
              />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-button bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Starting image</h3>
                    <p className="text-sm text-text-muted mt-0.5">
                      {isVeoPhoto
                        ? `Required — scene still for VEO image-to-video (${veoAspect} Shorts)`
                        : isGrok
                          ? 'Optional — Grok is text-to-video only'
                          : isSeedance
                            ? 'Optional — Seedance is text-to-video'
                            : 'PNG, JPG, WebP · up to 10MB'}
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={[
                    'relative border-2 border-dashed rounded-[18px] p-4 cursor-pointer overflow-hidden',
                    'transition-all duration-300',
                    dragOver
                      ? 'border-accent bg-accent/10 shadow-glow-violet'
                      : 'border-border-subtle bg-bg-base/30 hover:border-accent/40',
                  ].join(' ')}
                  style={{ minHeight: 180 }}
                >
                  {imagePreview ? (
                    <motion.div
                      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.45, ease: SMOOTH_EASE }}
                      className="relative"
                    >
                      <img src={imagePreview} alt="Source" className="w-full rounded-input object-contain max-h-64" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setImagePreview(null); setImageFile(null) }}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded-button bg-bg-base/80 backdrop-blur text-[10px] uppercase tracking-wider text-text-secondary hover:text-text-primary border border-border-subtle"
                      >
                        Replace
                      </button>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-8">
                      <motion.div
                        animate={reduce ? undefined : { y: [0, -5, 0] }}
                        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-14 h-14 rounded-2xl bg-bg-elevated border border-dashed border-border-subtle flex items-center justify-center mb-3"
                      >
                        <ImageIcon className="w-6 h-6 text-text-muted" />
                      </motion.div>
                      <p className="text-sm text-text-secondary">Drag an image, or click to browse</p>
                      <p className="text-[10px] text-text-muted mt-1">
                        Best results: match clip format — {veoAspect} · {duration}s
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </div>
              </div>
            </Card>

            {/* Clip format — aspect + duration for Shorts */}
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-button bg-status-info/15 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-status-info" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-text-primary">Clip format</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    9:16 vertical Shorts · 4–6 second clips
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-2">Aspect ratio</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VEO_ASPECTS.map((a) => {
                      const selected = veoAspect === a.value
                      return (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => setVeoAspect(a.value)}
                          className={[
                            'relative flex flex-col items-start gap-0.5 h-auto min-h-[52px] px-3 py-2.5 rounded-button border text-left transition-colors',
                            selected
                              ? 'border-accent/50 bg-accent/10 text-text-primary'
                              : 'border-border-subtle text-text-secondary hover:border-accent/30',
                          ].join(' ')}
                        >
                          <span className="text-sm font-medium">{a.label}</span>
                          <span className="text-[10px] text-text-muted">{a.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Duration</span>
                    <span className="text-sm font-mono text-accent-glow">{duration}s</span>
                  </div>
                  <LayoutGroup>
                    <div className="grid grid-cols-3 gap-2">
                      {DURATIONS.map((d) => {
                        const selected = duration === d
                        return (
                          <motion.button
                            key={d}
                            type="button"
                            onClick={() => setDuration(d)}
                            whileTap={reduce ? undefined : { scale: 0.96 }}
                            className={[
                              'relative h-11 rounded-button border text-sm font-mono font-medium',
                              selected ? 'border-accent/50 text-text-primary' : 'border-border-subtle text-text-secondary hover:border-accent/30',
                            ].join(' ')}
                          >
                            {selected && !reduce && (
                              <motion.span
                                layoutId="clip-duration-pill"
                                className="absolute inset-0 rounded-button bg-accent/12 border border-accent/35"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              />
                            )}
                            <span className="relative z-10">{d}s</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </LayoutGroup>
                  <p className="text-[10px] text-text-muted mt-2">
                    VEO free tier renders ~4s; 5–6s sets pacing in your animation prompt.
                  </p>
                </div>
              </div>
            </Card>

            {/* Motion prompt */}
            <Card>
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-button bg-accent/15 flex items-center justify-center shrink-0">
                  <Wand2 className="w-5 h-5 text-accent-glow" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg font-semibold text-text-primary">Animation prompt</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {isCloudVideo ? 'Text-to-video — min 15 characters.' : 'Describe how the image should move.'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={Sparkles}
                  loading={enhancing}
                  onClick={handleEnhancePrompt}
                  className="ml-auto shrink-0"
                >
                  Enhance
                </Button>
              </div>
              <Input
                label="What should happen?"
                value={motionPrompt}
                onChange={(e) => setMotionPrompt(e.target.value)}
                multiline
                rows={4}
                maxLength={800}
                placeholder="The candle flame flickers, smoke drifts upward, the camera gently pushes in..."
                inputClassName="!text-base !leading-relaxed min-h-[120px]"
              />
              {error && (
                <div className="mt-4">
                  <FriendlyError error={error} />
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-border-subtle">
                <MagneticButton strength={reduce ? 0 : 5} className="w-full">
                  <Button
                    onClick={handleGenerate}
                    loading={loading}
                    fullWidth
                    size="lg"
                    icon={Sparkles}
                    className="!h-14 shadow-glow-violet"
                    disabled={!motionPrompt.trim() || (isVeoPhoto && !imagePreview)}
                  >
                    {loading ? 'Animating…' : 'Animate clip'}
                  </Button>
                </MagneticButton>
              </div>
            </Card>

            {/* Camera */}
            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Camera movement</p>
              <LayoutGroup>
                <div className="grid grid-cols-4 gap-2">
                  {CAMERA_MOVES.map((m) => {
                    const Icon = m.icon
                    const selected = camera === m.key
                    return (
                      <motion.button
                        key={m.key}
                        type="button"
                        onClick={() => setCamera(m.key)}
                        whileTap={reduce ? undefined : { scale: 0.96 }}
                        className={[
                          'relative flex flex-col items-center justify-center h-14 rounded-button border gap-1',
                          'transition-colors duration-250',
                          selected ? 'border-accent/50 text-text-primary' : 'border-border-subtle text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        {selected && !reduce && (
                          <motion.span
                            layoutId="video-camera-pill"
                            className="absolute inset-0 rounded-button bg-accent/12 border border-accent/35"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <Icon className="relative z-10 w-3.5 h-3.5" />
                        <span className="relative z-10 text-[10px] font-medium">{m.label}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>
            </Card>

            {/* Engine + timing */}
            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-3">Engine</p>
              <EngineToggle value={engine} onChange={setEngine} size="lg" options={ENGINES} />

              {isCloudVideo && (
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-2">Model</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(isGrok ? GROK_MODELS : VEO_MODELS).map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => (isGrok ? setGrokModel(m.value) : setVeoModel(m.value))}
                          className={[
                            'h-10 rounded-button border text-sm font-medium transition-colors',
                            activeModel === m.value
                              ? 'border-accent/50 bg-accent/10 text-text-primary'
                              : 'border-border-subtle text-text-secondary hover:border-accent/30',
                          ].join(' ')}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-border-subtle space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Motion intensity</span>
                    <span className="text-sm font-mono text-accent-glow">
                      {INTENSITY.find((i) => i.value === intensity)?.label}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={INTENSITY.length - 1}
                    step={1}
                    value={INTENSITY.findIndex((i) => i.value === intensity)}
                    onChange={(e) => setIntensity(INTENSITY[Number(e.target.value)].value)}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1.5">
                    {INTENSITY.map((i) => <span key={i.value}>{i.label}</span>)}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-2">Frame rate</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FPS.map((f) => (
                      <motion.button
                        key={f}
                        type="button"
                        onClick={() => setFps(f)}
                        whileTap={reduce ? undefined : { scale: 0.96 }}
                        className={[
                          'h-10 rounded-button border text-sm font-mono font-medium',
                          fps === f
                            ? 'bg-accent/15 border-accent text-text-primary shadow-glow-violet-soft'
                            : 'bg-bg-elevated/50 border-border-subtle text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        {f} fps
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Advanced */}
            <Card className="overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Settings2 className="w-4 h-4 text-accent-glow" />
                  <span className="text-sm font-medium text-text-primary">Advanced</span>
                  {loop && <Badge color="violet" className="!py-0">loop</Badge>}
                </div>
                <motion.span
                  animate={{ rotate: advancedOpen ? 180 : 0 }}
                  transition={{ duration: 0.28, ease: SMOOTH_EASE }}
                  className="text-text-muted"
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {advancedOpen && (
                  <motion.div
                    key="advanced"
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.32, ease: SMOOTH_EASE }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 mt-4 border-t border-border-subtle space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Loop clip (ambient)</span>
                        <button
                          type="button"
                          onClick={() => setLoop((v) => !v)}
                          className={[
                            'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-pill overflow-hidden',
                            'border transition-colors duration-200',
                            loop ? 'bg-accent border-accent' : 'bg-bg-base border-border-subtle',
                          ].join(' ')}
                          aria-pressed={loop}
                        >
                          <span
                            className={[
                              'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                              loop ? 'translate-x-[18px]' : 'translate-x-0.5',
                            ].join(' ')}
                          />
                        </button>
                      </div>
                      <Input
                        label="Seed"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        placeholder="Empty = random"
                        mono
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>

          {/* Preview theater */}
          <div className="xl:col-span-7 space-y-6">
            <Card className="relative overflow-hidden min-h-[360px]">
              <div
                className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-accent/[0.06] to-transparent pointer-events-none"
                aria-hidden="true"
              />

              <div className="relative flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-button bg-bg-elevated border border-border-subtle flex items-center justify-center">
                    <Video className="w-4 h-4 text-accent-glow" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text-primary">Preview</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {loading ? 'Rendering your clip…' : current?.video_url ? 'Latest generation' : 'Output appears here'}
                    </p>
                  </div>
                </div>
                {current?.video_url && !loading && (
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={Download}
                      title="Download"
                      onClick={() => {
                        const a = document.createElement('a')
                        a.href = current.video_url
                        a.download = `vyom-clip-${Date.now()}.mp4`
                        a.target = '_blank'
                        a.rel = 'noopener noreferrer'
                        a.click()
                      }}
                    />
                  </div>
                )}
              </div>

              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className={`${previewAspectClass} rounded-[20px] skeleton border border-border-subtle`} />
                    <ProgressBar indeterminate />
                    <p className="text-sm text-text-secondary text-center">
                      {isCloudVideo ? (
                        <>
                          Generating with{' '}
                          <span className="text-accent-glow font-medium">
                            {VIDEO_ENGINE_LABELS[engine] || engine}
                          </span>
                          …
                        </>
                      ) : (
                        <>
                          Animating with{' '}
                          <span className="text-accent-glow font-medium">
                            {VIDEO_ENGINE_LABELS[engine] || engine}
                          </span>
                          …
                        </>
                      )}
                    </p>
                  </motion.div>
                ) : current?.video_url ? (
                  <motion.div
                    key="result"
                    variants={reduce ? undefined : revealVariants}
                    initial={reduce ? false : 'hidden'}
                    animate="visible"
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className="relative rounded-[20px] overflow-hidden border border-border-subtle bg-black shadow-glow-violet-soft">
                      {videoLoadError ? (
                        <div className={`${previewAspectClass} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
                          <Video className="w-10 h-10 text-text-muted" />
                          <p className="text-sm text-text-secondary">{videoLoadError}</p>
                          <Button
                            variant="ghost"
                            icon={RefreshCw}
                            onClick={() => {
                              setVideoLoadError('')
                              const v = videoRef.current
                              if (v) {
                                v.load()
                                v.play().catch(() => {})
                              }
                            }}
                          >
                            Retry playback
                          </Button>
                        </div>
                      ) : (
                        <video
                          key={current.video_url}
                          ref={videoRef}
                          src={current.video_url}
                          className={`${previewAspectClass} object-contain bg-black`}
                          autoPlay
                          loop={loop}
                          muted={muted}
                          playsInline
                          preload="auto"
                          onPlay={() => setPlaying(true)}
                          onPause={() => setPlaying(false)}
                          onLoadedData={() => setVideoLoadError('')}
                          onError={() => {
                            setVideoLoadError(
                              'Could not load this clip in the browser. If generation just finished, try Animate again — the file may not have saved correctly.',
                            )
                          }}
                        />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const v = videoRef.current
                            if (!v) return
                            if (v.paused) v.play()
                            else v.pause()
                          }}
                          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                        >
                          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        <div className="flex-1 text-[10px] text-white/70 font-mono">
                          {veoAspect} · {duration}s · {fps}fps · {loop ? 'loop' : 'once'}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMuted((v) => !v)}
                          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                        >
                          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => videoRef.current?.requestFullscreen?.()}
                          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                          title="Fullscreen"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 rounded-[18px] bg-bg-elevated/50 border border-border-subtle">
                      <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
                        {current.motion_prompt}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge color="violet">{current.engine || engine}</Badge>
                        <Badge color="muted"><Smartphone className="w-3 h-3" />{current.aspect || veoAspect}</Badge>
                        <Badge color="muted"><Camera className="w-3 h-3" />{cameraLabel(camera)}</Badge>
                        <Badge color="muted"><Clock className="w-3 h-3" />{current.duration || duration}s</Badge>
                        <Badge color="muted">{fps} fps</Badge>
                        {loop && <Badge color="violet">loop</Badge>}
                        {current.veoModel && (
                          <Badge color="muted">
                            {String(current.veoModel).includes('grok') ? 'Grok' : 'VEO'} {current.veoModel}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : current ? (
                  <motion.div
                    key="failed"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                  >
                    <EmptyState
                      icon={Video}
                      title="Generation returned no clip"
                      description="The backend responded but didn't return a video. Check the console or try again."
                      action={
                        <Button onClick={handleGenerate} icon={RefreshCw} variant="ghost">Retry</Button>
                      }
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                  >
                    <div className="py-4">
                      <EmptyState
                        icon={Video}
                        title="No clip yet"
                        description={
                          isCloudVideo
                            ? 'Write a motion prompt and hit Animate. Your clip renders here.'
                            : 'Drop a starting image, describe the motion, and hit Animate. Your clip renders here with playback controls.'
                        }
                      />
                    </div>
                    <div className={`mx-auto max-w-lg rounded-[20px] border border-dashed border-border-subtle bg-bg-base/30 ${previewAspectClass} flex items-center justify-center text-text-muted`}>
                      <motion.div
                        animate={reduce ? undefined : { y: [0, -6, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="text-center px-6"
                      >
                        <Video className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p className="text-xs uppercase tracking-widest">Preview theater</p>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            <AnimatePresence>
              {history.length > 0 && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.45, ease: SMOOTH_EASE }}
                >
                  <Card>
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="font-display text-lg font-semibold text-text-primary">History</h3>
                      <Badge color="muted">{history.length} saved</Badge>
                    </div>
                    <motion.div
                      variants={reduce ? undefined : gridStagger}
                      initial={reduce ? false : 'hidden'}
                      animate="visible"
                      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
                    >
                      {history.map((h, i) => (
                        <motion.button
                          key={`${h.video_url || 'clip'}-${i}`}
                          type="button"
                          variants={reduce ? undefined : gridItemVariants}
                          whileHover={reduce ? undefined : { y: -3 }}
                          onClick={() => setCurrent(h)}
                          className={[
                            'group relative rounded-[16px] overflow-hidden border border-border-subtle hover:border-accent/40 hover:shadow-glow-violet-soft transition-all duration-300',
                            (h.aspect || veoAspect) === '9:16' ? 'aspect-[9/16]' : 'aspect-video',
                          ].join(' ')}
                        >
                          {h.thumbnail_url || h.video_url ? (
                            <img
                              src={h.thumbnail_url || h.video_url}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full bg-bg-elevated flex items-center justify-center">
                              <Video className="w-5 h-5 text-text-muted" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <span className="absolute bottom-2 left-2 text-[10px] text-white/90 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                            {h.duration || duration}s
                          </span>
                        </motion.button>
                      ))}
                    </motion.div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Section>
    </Root>
  )
}

function QuickStat({ icon: Icon, label, value, accent, reduce }) {
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

function IconButton({ icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-2.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 border border-transparent hover:border-border-subtle transition-all duration-200"
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
