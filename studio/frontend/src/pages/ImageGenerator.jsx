import { useState, useEffect } from 'react'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Sparkles, Wand2, Image as ImageIcon, ChevronDown,
  Settings2, Shuffle, Download, Copy, Zap, Layers, Ratio, SlidersHorizontal,
} from 'lucide-react'
import { generateApi, resolveMediaUrl } from '../api/client'
import { useToast } from '../components/ui/Toast'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import EngineToggle from '../components/ui/EngineToggle'
import EmptyState from '../components/ui/EmptyState'
import ProgressBar from '../components/ui/ProgressBar'
import FriendlyError from '../components/ui/FriendlyError'
import MagneticButton from '../components/MagneticButton'
import useSettingsStore from '../store/settingsStore'
import useProjectStore from '../store/projectStore'
import SceneLinkBanner from '../components/SceneLinkBanner'
import {
  SCENE_IMAGE_HANDOFF_KEY,
  attachSceneAssetAndMaybePersist,
  clearSceneHandoff,
  mediaPathForStorage,
  readSceneHandoff,
} from '../utils/sceneAssets'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

const STYLES = [
  { key: 'cinematic',      label: 'Cinematic',      swatch: 'linear-gradient(135deg, #1A1A2E 0%, #7C3AED 100%)' },
  { key: 'painterly',      label: 'Painterly',      swatch: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)' },
  { key: 'anime',          label: 'Anime',          swatch: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)' },
  { key: 'photorealistic', label: 'Photorealistic', swatch: 'linear-gradient(135deg, #0F0F1A 0%, #2A2A45 100%)' },
  { key: 'watercolor',     label: 'Watercolor',     swatch: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)' },
  { key: 'comic',          label: 'Comic',          swatch: 'linear-gradient(135deg, #EF4444 0%, #FCD34D 100%)' },
  { key: 'storybook',      label: 'Storybook',      swatch: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)' },
]

const ASPECT = [
  { key: '9:16', label: '9:16', sub: 'Shorts' },
  { key: '16:9', label: '16:9', sub: 'Wide' },
  { key: '1:1',  label: '1:1',  sub: 'Square' },
  { key: '4:5',  label: '4:5',  sub: 'Portrait' },
]

const RESOLUTIONS = [512, 768, 1024, 1280]

const ENGINES = [
  { value: 'nano',           label: 'Nano' },
  { value: 'seedance-image', label: 'Seedance' },
  { value: 'veo-image',      label: 'VEO' },
  { value: 'grok-image',     label: 'Grok' },
  { value: 'imagen3',        label: 'Imagen' },
  { value: 'flux',           label: 'FLUX' },
]

const IMAGE_ENGINE_LABELS = {
  nano: 'Nano Banana Pro',
  'seedance-image': 'Seedance 2.0',
  'veo-image': 'VEO',
  'grok-image': 'Grok 4',
  imagen3: 'Imagen 3',
  flux: 'FLUX.1',
}

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

function aspectToRatio(value) {
  return (value || '9:16').replace(':', '/')
}

export default function ImageGenerator() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const s = useSettingsStore.getState()

  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState(s.imageDefaultNegative || '')
  const [style, setStyle] = useState(s.imageDefaultStyle || 'cinematic')
  const [aspect, setAspect] = useState(s.imageDefaultAspect || '9:16')
  const [resolution, setResolution] = useState(parseInt(s.imageDefaultResolution || '1024', 10))
  const [engine, setEngine] = useState(s.imageDefaultEngine || 'imagen3')
  const [variations, setVariations] = useState(s.imageDefaultVariations || 1)
  const [seed, setSeed] = useState(s.imageDefaultSeed || '')
  const [seedLocked, setSeedLocked] = useState(s.imageLockSeed || false)
  const [negativeOpen, setNegativeOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [linkedScene, setLinkedScene] = useState(null)

  useEffect(() => {
    const payload = readSceneHandoff(SCENE_IMAGE_HANDOFF_KEY)
    if (!payload?.scene_id) return
    clearSceneHandoff(SCENE_IMAGE_HANDOFF_KEY)
    setLinkedScene({
      id: payload.scene_id,
      scene_number: payload.scene_number,
      label: payload.label,
    })
    if (payload.prompt) setPrompt(payload.prompt)
    if (payload.negative_prompt) setNegative(payload.negative_prompt)
    if (payload.aspect_ratio) setAspect(payload.aspect_ratio)
    if (payload.engine) setEngine(payload.engine)
  }, [])

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await generateApi.generateImage({
        prompt,
        negative_prompt: negative || undefined,
        engine,
        style,
        aspect_ratio: aspect,
        resolution: String(resolution),
        variations,
        seed: seed || undefined,
      })
      if (res.data?.success && res.data?.image_url) {
        if (res.data.metadata?.provider_fallback_used) {
          toast({
            kind: 'info',
            title: 'Generated with Nano Banana Pro',
            message: 'Your selected engine was unavailable — we used Nano Banana Pro instead.',
            duration: 5000,
          })
        }
        const item = {
          ...res.data,
          image_url: resolveMediaUrl(res.data.image_url),
          prompt,
          style,
          aspect_ratio: aspect,
          createdAt: new Date(),
        }
        setCurrent(item)
        setHistory((h) => [item, ...h].slice(0, 12))

        if (linkedScene?.id) {
          const store = useProjectStore.getState()
          const imagePath = mediaPathForStorage(res.data.image_url || res.data.image_path)
          const persist = await attachSceneAssetAndMaybePersist(
            linkedScene.id,
            {
              image_url: imagePath,
              image_path: res.data.image_path,
              prompt: prompt.trim(),
            },
            store,
          )
          toast({
            kind: persist.ok ? 'success' : 'info',
            title: `Scene ${linkedScene.scene_number ?? ''} image ready`,
            message: persist.ok
              ? 'Storyboard updated and project saved to SQLite.'
              : 'Storyboard updated — Save project in Story Editor to persist after refresh.',
          })
        }
      } else {
        setError(res.data?.message || res.data?.detail || 'Image generation failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Image generation failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleRandomSeed = () => {
    if (seedLocked) return
    setSeed(Math.floor(Math.random() * 999999999).toString())
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
          Image engine
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Craft a <span className="text-gradient-violet">visual</span> in seconds
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Nano, Seedance, VEO, Imagen, or FLUX — tuned for storyboard frames and YouTube Shorts thumbnails.
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
          <QuickStat icon={Zap} label="Engine" value={IMAGE_ENGINE_LABELS[engine] || engine} accent="#7C3AED" reduce={reduce} />
          <QuickStat icon={Ratio} label="Aspect" value={aspect} accent="#3B82F6" reduce={reduce} />
          <QuickStat icon={SlidersHorizontal} label="Resolution" value={`${resolution}px`} accent="#06B6D4" reduce={reduce} />
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
            <Card className="relative overflow-hidden">
              <div
                className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-[0.12] pointer-events-none"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-button bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Prompt</h3>
                    <p className="text-sm text-text-muted mt-0.5">Describe the frame you need.</p>
                  </div>
                </div>

                <Input
                  label="Image prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  multiline
                  rows={8}
                  maxLength={1500}
                  placeholder="A magical forest with ancient banyan trees glowing soft blue light, cinematic wide shot, golden hour mist..."
                  inputClassName="!text-base !leading-relaxed min-h-[180px]"
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
                      disabled={!prompt.trim()}
                    >
                      {loading ? 'Generating…' : 'Generate image'}
                    </Button>
                  </MagneticButton>
                </div>
              </div>
            </Card>

            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-3">Engine</p>
              <EngineToggle
                value={engine}
                onChange={setEngine}
                size="lg"
                options={ENGINES}
              />
            </Card>

            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Visual style</p>
              <LayoutGroup>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {STYLES.map((st) => {
                    const selected = style === st.key
                    return (
                      <motion.button
                        key={st.key}
                        type="button"
                        onClick={() => setStyle(st.key)}
                        whileTap={reduce ? undefined : { scale: 0.97 }}
                        className={[
                          'relative h-[72px] rounded-[14px] overflow-hidden border text-left',
                          'transition-colors duration-250',
                          selected ? 'border-accent shadow-glow-violet-soft' : 'border-border-subtle hover:border-accent/35',
                        ].join(' ')}
                      >
                        <div className="absolute inset-0" style={{ background: st.swatch }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                        {selected && !reduce && (
                          <motion.span
                            layoutId="image-style-ring"
                            className="absolute inset-0 rounded-[14px] ring-2 ring-accent ring-inset"
                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                          />
                        )}
                        <span className="relative z-10 absolute bottom-2 left-2.5 text-[11px] font-semibold text-white">
                          {st.label}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>
            </Card>

            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Aspect ratio</p>
              <LayoutGroup>
                <div className="grid grid-cols-2 gap-2.5">
                  {ASPECT.map((a) => {
                    const selected = aspect === a.key
                    return (
                      <motion.button
                        key={a.key}
                        type="button"
                        onClick={() => setAspect(a.key)}
                        whileTap={reduce ? undefined : { scale: 0.98 }}
                        className={[
                          'relative flex flex-col items-start justify-center px-4 h-14 rounded-button border text-left',
                          selected ? 'border-accent/50 text-text-primary' : 'border-border-subtle text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        {selected && !reduce && (
                          <motion.span
                            layoutId="image-aspect-pill"
                            className="absolute inset-0 rounded-button bg-accent/12 border border-accent/35"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <span className="relative z-10 text-sm font-semibold">{a.label}</span>
                        <span className="relative z-10 text-[10px] text-text-muted mt-0.5">{a.sub}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>
            </Card>

            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Output settings</p>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Resolution</span>
                    <span className="text-sm font-mono text-accent-glow">{resolution}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={RESOLUTIONS.length - 1}
                    step={1}
                    value={RESOLUTIONS.indexOf(resolution)}
                    onChange={(e) => setResolution(RESOLUTIONS[Number(e.target.value)])}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1.5 font-mono">
                    {RESOLUTIONS.map((r) => <span key={r}>{r}</span>)}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Variations</span>
                    <span className="text-sm font-mono text-accent-glow">×{variations}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <motion.button
                        key={n}
                        type="button"
                        onClick={() => setVariations(n)}
                        whileTap={reduce ? undefined : { scale: 0.96 }}
                        className={[
                          'h-10 rounded-button border text-sm font-mono font-medium',
                          variations === n
                            ? 'bg-accent/15 border-accent text-text-primary shadow-glow-violet-soft'
                            : 'bg-bg-elevated/50 border-border-subtle text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        ×{n}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Seed</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRandomSeed}
                        disabled={seedLocked}
                        className="p-2 rounded-lg text-text-muted hover:text-accent-glow hover:bg-white/5 transition-colors disabled:opacity-30"
                        title="Random seed"
                      >
                        <Shuffle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeedLocked((v) => !v)}
                        className={[
                          'text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-pill border transition-colors',
                          seedLocked
                            ? 'border-accent text-accent-glow bg-accent/10'
                            : 'border-border-subtle text-text-muted hover:text-text-primary',
                        ].join(' ')}
                      >
                        {seedLocked ? 'Locked' : 'Unlocked'}
                      </button>
                    </div>
                  </div>
                  <Input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="Empty = random"
                    mono
                  />
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <button
                type="button"
                onClick={() => setNegativeOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Settings2 className="w-4 h-4 text-accent-glow" />
                  <span className="text-sm font-medium text-text-primary">Negative prompt</span>
                  {negative && <Badge color="violet" className="!py-0">set</Badge>}
                </div>
                <motion.span
                  animate={{ rotate: negativeOpen ? 180 : 0 }}
                  transition={{ duration: 0.28, ease: SMOOTH_EASE }}
                  className="text-text-muted"
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {negativeOpen && (
                  <motion.div
                    key="neg"
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.32, ease: SMOOTH_EASE }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 mt-4 border-t border-border-subtle">
                      <textarea
                        value={negative}
                        onChange={(e) => setNegative(e.target.value)}
                        rows={3}
                        placeholder="blurry, low quality, extra fingers, watermark…"
                        className="w-full bg-bg-elevated/50 rounded-input border border-border-subtle px-3.5 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none font-mono leading-relaxed"
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
                    <ImageIcon className="w-4 h-4 text-accent-glow" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text-primary">Preview</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {loading ? 'Rendering your frame…' : current ? 'Latest generation' : 'Output appears here'}
                    </p>
                  </div>
                </div>
                {current && !loading && (
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={Copy}
                      title="Copy prompt"
                      onClick={() => navigator.clipboard?.writeText(current.prompt || '')}
                    />
                    <IconButton
                      icon={Download}
                      title="Download"
                      onClick={() => {
                        const a = document.createElement('a')
                        a.href = resolveMediaUrl(current.image_url)
                        a.download = `vyom-image-${Date.now()}.png`
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
                    <div
                      className="max-w-full mx-auto rounded-[20px] skeleton border border-border-subtle"
                      style={{ aspectRatio: aspectToRatio(aspect), maxHeight: '520px' }}
                    />
                    <ProgressBar indeterminate />
                    <p className="text-sm text-text-secondary text-center">
                      Generating with{' '}
                      <span className="text-accent-glow font-medium">
                        {IMAGE_ENGINE_LABELS[engine] || engine}
                      </span>
                      …
                    </p>
                  </motion.div>
                ) : current ? (
                  <motion.div
                    key="result"
                    variants={reduce ? undefined : revealVariants}
                    initial={reduce ? false : 'hidden'}
                    animate="visible"
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="space-y-4"
                  >
                    <div
                      className="rounded-[20px] overflow-hidden border border-border-subtle bg-bg-elevated shadow-glow-violet-soft mx-auto max-h-[520px]"
                      style={{ aspectRatio: aspectToRatio(aspect) }}
                    >
                      <motion.img
                        src={current.image_url}
                        alt={current.prompt}
                        className="w-full h-full object-cover"
                        initial={reduce ? false : { scale: 1.03 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.6, ease: SMOOTH_EASE }}
                      />
                    </div>
                    <div className="p-4 rounded-[18px] bg-bg-elevated/50 border border-border-subtle">
                      <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">{current.prompt}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge color="violet">{current.engine || engine}</Badge>
                        <Badge color="muted">{current.style || style}</Badge>
                        <Badge color="muted">{current.aspect_ratio || aspect}</Badge>
                        <Badge color="muted">{resolution}px</Badge>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                  >
                    <div className="py-6">
                      <EmptyState
                        icon={ImageIcon}
                        title="No image yet"
                        description="Write a prompt, pick engine + style, and generate. Perfect for storyboard frames and Shorts thumbnails."
                      />
                    </div>
                    <div
                      className="mx-auto max-w-md rounded-[20px] border border-dashed border-border-subtle bg-bg-base/30 flex items-center justify-center text-text-muted"
                      style={{ aspectRatio: aspectToRatio(aspect), maxHeight: '280px' }}
                    >
                      <motion.div
                        animate={reduce ? undefined : { y: [0, -6, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="text-center px-6"
                      >
                        <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p className="text-xs uppercase tracking-widest">Preview canvas</p>
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
                          key={`${h.image_url}-${i}`}
                          type="button"
                          variants={reduce ? undefined : gridItemVariants}
                          whileHover={reduce ? undefined : { y: -3 }}
                          onClick={() => setCurrent(h)}
                          className="group relative aspect-square rounded-[16px] overflow-hidden border border-border-subtle hover:border-accent/40 hover:shadow-glow-violet-soft transition-all duration-300"
                        >
                          <img src={h.image_url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <span className="absolute bottom-2 left-2 text-[10px] text-white/90 font-medium opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[90%]">
                            {h.style || style}
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
