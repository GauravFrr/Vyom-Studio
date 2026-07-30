import { useState, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Key, Palette, ShieldCheck, Eye, EyeOff, Check, Sparkles,
  RotateCcw, Save, Trash2, Activity, BookOpen, Image as ImageIcon,
  Video, Download, Settings as SettingsIcon, Gauge,
  Code, FileDown, FileUp, Info, Zap,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import EngineToggle from '../components/ui/EngineToggle'
import Badge from '../components/ui/Badge'
import Select from '../components/ui/Select'
import MagneticButton from '../components/MagneticButton'
import { useToast } from '../components/ui/Toast'
import useSettingsStore from '../store/settingsStore'
import { usageApi } from '../api/client'
import useMotionPreference, { springTransition } from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

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
        <p className="font-display text-sm font-bold text-text-primary truncate leading-tight capitalize">{value}</p>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  )
  if (reduce) return <div>{inner}</div>
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

// ---------------------------------------------------------------- section list
//
// 10 in-page sections. Order matters: API keys first, then domain defaults
// (story / image / video / export), then app-level concerns (behavior,
// performance, display, privacy, developer).
const SECTIONS = [
  { id: 'api',        label: 'API Keys',         icon: Key },
  { id: 'story',      label: 'Story Pipeline',   icon: BookOpen },
  { id: 'image',      label: 'Image Generation', icon: ImageIcon },
  { id: 'video',      label: 'Video Generation', icon: Video },
  { id: 'export',     label: 'Export',           icon: Download },
  { id: 'behavior',   label: 'Behavior',         icon: SettingsIcon },
  { id: 'performance',label: 'Performance',      icon: Gauge },
  { id: 'display',    label: 'Display',          icon: Palette },
  { id: 'privacy',    label: 'Privacy & Data',   icon: ShieldCheck },
  { id: 'developer',  label: 'Developer',        icon: Code },
]

// Genre + language + style choices shared by story + image sections.
const GENRES = [
  { value: 'mythological', label: 'Mythological' },
  { value: 'moral',        label: 'Moral' },
  { value: 'adventure',    label: 'Adventure' },
  { value: 'romance',      label: 'Romance' },
  { value: 'horror',       label: 'Horror' },
  { value: 'sci-fi',       label: 'Sci-Fi' },
  { value: 'historical',   label: 'Historical' },
  { value: 'slice-of-life',label: 'Slice of Life' },
]
const LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'hindi',   label: 'हिन्दी (Hindi)' },
]
const LENGTHS = [
  { value: 'short',  label: 'Short — 2-3 paragraphs (YouTube Shorts)' },
  { value: 'medium', label: 'Medium — 5-7 paragraphs (1-2 min)' },
  { value: 'long',   label: 'Long — 10+ paragraphs (3-5 min)' },
]
const STYLES = [
  { value: 'cinematic',      label: 'Cinematic' },
  { value: 'painterly',      label: 'Painterly' },
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'anime',          label: 'Anime' },
  { value: 'watercolor',     label: 'Watercolor' },
  { value: 'comic',          label: 'Comic' },
  { value: 'storybook',      label: 'Storybook' },
]
const ASPECTS = [
  { value: '9:16', label: '9:16 — Vertical (YouTube Shorts, Reels)' },
  { value: '16:9', label: '16:9 — Horizontal (YouTube)' },
  { value: '1:1',  label: '1:1 — Square (Instagram)' },
  { value: '4:3',  label: '4:3 — Classic' },
  { value: '3:4',  label: '3:4 — Portrait' },
]
const RESOLUTIONS = [
  { value: '512',  label: '512px' },
  { value: '768',  label: '768px' },
  { value: '1024', label: '1024px' },
  { value: '1080', label: '1080p' },
]
const PROVIDERS = [
  { value: 'auto',     label: 'Auto — TokenLB → Gemini → Claude' },
  { value: 'tokenlb',  label: 'TokenLB (tokenlb.net)' },
  { value: 'claude',   label: 'Claude (Anthropic)' },
  { value: 'gemini',   label: 'Gemini (Google)' },
]
const TOKENLB_MODELS = [
  { value: 'claude-sonnet-4-6',      label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-7',        label: 'Claude Opus 4.7' },
  { value: 'claude-opus-4-6',        label: 'Claude Opus 4.6' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gpt-5.5',                label: 'GPT 5.5' },
  { value: 'gpt-5.4',                label: 'GPT 5.4' },
  { value: 'gpt-5.4-mini',           label: 'GPT 5.4 Mini' },
]
const STORAGE_OPTIONS = [
  { value: '../storage',       label: 'studio/storage (default)' },
  { value: 'D:/Dadaji/storage',label: 'D:/Dadaji/storage' },
  { value: 'C:/AI-Assets',     label: 'C:/AI-Assets' },
]
const VIDEO_ENGINES = [
  { value: 'veo3', label: 'VEO 3' },
  { value: 'ltx',  label: 'LTX-Video' },
  { value: 'cog',  label: 'CogVideoX' },
]
const IMAGE_ENGINES = [
  { value: 'nano',           label: 'Nano Banana Pro' },
  { value: 'seedance-image', label: 'Seedance 2.0' },
  { value: 'veo-image',      label: 'VEO' },
  { value: 'grok-image',     label: 'Grok 4' },
  { value: 'imagen3',        label: 'Imagen 3' },
  { value: 'flux',           label: 'FLUX.1' },
]
const INTENSITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
]
const CAMERA_MOVEMENTS = [
  { value: 'static',  label: 'Static' },
  { value: 'pan',     label: 'Pan' },
  { value: 'tilt',    label: 'Tilt' },
  { value: 'zoom-in', label: 'Zoom in' },
  { value: 'zoom-out',label: 'Zoom out' },
  { value: 'orbit',   label: 'Orbit' },
]
const TRANSITIONS = [
  { value: 'cut',      label: 'Cut — hard cut' },
  { value: 'fade',     label: 'Fade — black fade through' },
  { value: 'dissolve', label: 'Dissolve — cross-blend' },
]
const SUBTITLE_STYLES = [
  { value: 'minimal',    label: 'Minimal — small white text, bottom' },
  { value: 'bold',       label: 'Bold — large yellow with outline' },
  { value: 'cinematic',  label: 'Cinematic — centered, fade in/out' },
]
const DENSITIES = [
  { value: 'compact',     label: 'Compact — more on screen' },
  { value: 'comfortable', label: 'Comfortable — default' },
  { value: 'spacious',    label: 'Spacious — bigger touch targets' },
]
const FONT_SCALES = [
  { value: '0.9', label: 'S — 90%' },
  { value: '1.0', label: 'M — 100% (default)' },
  { value: '1.1', label: 'L — 110%' },
  { value: '1.2', label: 'XL — 120%' },
]
const LOG_LEVELS = [
  { value: 'error', label: 'Error — only errors' },
  { value: 'warn',  label: 'Warn — errors + warnings (default)' },
  { value: 'info',  label: 'Info — + lifecycle events' },
  { value: 'debug', label: 'Debug — + request/response bodies' },
]

// ===================================================================== root
export default function Settings() {
  const toast = useToast()
  const settings = useSettingsStore()
  const reduce = useMotionPreference()
  const [active, setActive] = useState('api')
  const [showKey, setShowKey] = useState({
    anthropic: false, google: false, openai: false, kaggle: false,
    tokenlb: false, nano: false, durex: false,
  })
  const [saved, setSaved] = useState(false)
  const [usageStats, setUsageStats] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (active !== 'performance') return
    usageApi.today()
      .then((r) => setUsageStats(r.data))
      .catch(() => setUsageStats(null))
  }, [
    active,
    settings.enableApiUsageLimits,
    settings.tokenlbDailyLimit,
    settings.nanoDailyLimit,
    settings.veoDailyLimit,
    settings.durexDailyLimit,
    settings.tokenlbApiKey,
    settings.tokenlbApiKeys,
  ])

  // "Draft" so editing doesn't immediately mutate persisted settings. Only
  // the API Keys section is draft-driven (because of the show/hide password
  // state); the rest of the sections write-through to the store.
  const [draft, setDraft] = useState({
    googleApiKey: settings.googleApiKey,
    anthropicApiKey: settings.anthropicApiKey,
    openaiApiKey: settings.openaiApiKey,
    kaggleTunnelUrl: settings.kaggleTunnelUrl,
    tokenlbApiKey: settings.tokenlbApiKey,
    tokenlbApiKeys: settings.tokenlbApiKeys,
    tokenlbBaseUrl: settings.tokenlbBaseUrl,
    nanoApiKey: settings.nanoApiKey,
    nanoApiUrl: settings.nanoApiUrl,
    durexApiKey: settings.durexApiKey,
    durexApiUrl: settings.durexApiUrl,
    durexProxy: settings.durexProxy,
    storagePath: settings.storagePath || '../storage',
  })

  useEffect(() => {
    setDraft((d) => ({
      ...d,
      googleApiKey: settings.googleApiKey,
      anthropicApiKey: settings.anthropicApiKey,
      openaiApiKey: settings.openaiApiKey,
      kaggleTunnelUrl: settings.kaggleTunnelUrl,
      tokenlbApiKey: settings.tokenlbApiKey,
      tokenlbApiKeys: settings.tokenlbApiKeys,
      tokenlbBaseUrl: settings.tokenlbBaseUrl,
      nanoApiKey: settings.nanoApiKey,
      nanoApiUrl: settings.nanoApiUrl,
      durexApiKey: settings.durexApiKey,
      durexApiUrl: settings.durexApiUrl,
      durexProxy: settings.durexProxy,
      storagePath: settings.storagePath || '../storage',
    }))
  }, [
    settings.googleApiKey, settings.anthropicApiKey, settings.openaiApiKey, settings.kaggleTunnelUrl,
    settings.tokenlbApiKey, settings.tokenlbApiKeys, settings.tokenlbBaseUrl,
    settings.nanoApiKey, settings.nanoApiUrl,
    settings.durexApiKey, settings.durexApiUrl, settings.durexProxy,
    settings.storagePath,
  ])

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e?.target ? e.target.value : e }))

  // Write-through setter for any store field. Used by the non-key sections.
  const w = (key) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    if (typeof settings[`set${key[0].toUpperCase()}${key.slice(1)}`] === 'function') {
      settings[`set${key[0].toUpperCase()}${key.slice(1)}`](v)
    }
  }

  const handleSave = () => {
    settings.setGoogleApiKey(draft.googleApiKey)
    settings.setAnthropicApiKey(draft.anthropicApiKey)
    settings.setOpenaiApiKey(draft.openaiApiKey)
    settings.setKaggleTunnelUrl(draft.kaggleTunnelUrl)
    settings.setTokenlbApiKey(draft.tokenlbApiKey)
    settings.setTokenlbApiKeys(draft.tokenlbApiKeys)
    settings.setTokenlbBaseUrl(draft.tokenlbBaseUrl)
    settings.setNanoApiKey(draft.nanoApiKey)
    settings.setNanoApiUrl(draft.nanoApiUrl)
    settings.setDurexApiKey(draft.durexApiKey)
    settings.setDurexApiUrl(draft.durexApiUrl)
    settings.setDurexProxy(draft.durexProxy)
    settings.setStoragePath(draft.storagePath)
    setSaved(true)
    toast({ kind: 'success', title: 'Settings saved' })
    setTimeout(() => setSaved(false), 2500)
  }

  const handleResetAll = () => {
    if (!confirm('Reset ALL settings to defaults? API keys will be cleared too.')) return
    settings.resetDefaults()
    toast({ kind: 'info', title: 'All settings reset' })
  }

  const handleClearKeys = () => {
    if (!confirm('Clear all API keys from local storage?')) return
    settings.setGoogleApiKey('')
    settings.setAnthropicApiKey('')
    settings.setKaggleTunnelUrl('')
    settings.setTokenlbApiKey('')
    settings.setTokenlbApiKeys('')
    settings.setNanoApiKey('')
    settings.setDurexApiKey('')
    toast({ kind: 'info', title: 'API keys cleared' })
  }

  const handleExport = () => {
    // Export the current settings as a JSON file. Useful for sharing
    // between machines, debugging, or backup before a reset.
    const persisted = {}
    for (const k of Object.keys(settings)) {
      if (typeof settings[k] === 'function') continue
      if (k.startsWith('set') && k !== 'setDarkMode' && k !== 'setLanguage') continue
      persisted[k] = settings[k]
    }
    // Don't export keys in the share file — security default.
    persisted.googleApiKey = ''
    persisted.anthropicApiKey = ''
    persisted.kaggleTunnelUrl = ''
    persisted.tokenlbApiKey = ''
    persisted.tokenlbApiKeys = ''
    persisted.nanoApiKey = ''
    persisted.durexApiKey = ''
    persisted.durexProxy = ''
    const blob = new Blob([JSON.stringify(persisted, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vyom-settings-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast({ kind: 'success', title: 'Settings exported' })
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        settings.importSettings(data)
        toast({ kind: 'success', title: 'Settings imported' })
      } catch (err) {
        toast({ kind: 'error', title: 'Invalid settings file' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''  // allow re-import of same file
  }

  const keysConfigured = useMemo(() => {
    const keys = [
      settings.anthropicApiKey,
      settings.googleApiKey,
      settings.kaggleTunnelUrl,
      settings.tokenlbApiKey,
      settings.nanoApiKey,
      settings.durexApiKey,
    ]
    return keys.filter((k) => String(k || '').trim()).length
  }, [
    settings.anthropicApiKey,
    settings.googleApiKey,
    settings.kaggleTunnelUrl,
    settings.tokenlbApiKey,
    settings.nanoApiKey,
    settings.durexApiKey,
  ])

  const activeSection = SECTIONS.find((s) => s.id === active) || SECTIONS[0]

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
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
          Studio configuration
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Tune your <span className="text-gradient-violet">workspace</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          API keys, pipeline defaults, credit limits, and display — stored locally in your browser, never on our servers.
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
          <StatPill icon={Key} label="Keys set" value={`${keysConfigured} / 6`} accent="#7C3AED" reduce={reduce} />
          <StatPill icon={BookOpen} label="Story provider" value={settings.storyProvider} accent="#3B82F6" reduce={reduce} />
          <StatPill icon={ImageIcon} label="Image engine" value={settings.imageDefaultEngine} accent="#06B6D4" reduce={reduce} />
          <StatPill
            icon={Zap}
            label="Daily limits"
            value={settings.enableApiUsageLimits ? 'Protected' : 'Off'}
            accent={settings.enableApiUsageLimits ? '#10B981' : '#F59E0B'}
            reduce={reduce}
          />
        </motion.div>
      </Section>

      {/* Workspace */}
      <Section reduce={reduce}>
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 lg:gap-6">
          {/* Sticky nav rail */}
          <Card className="relative overflow-hidden lg:sticky lg:top-24 lg:self-start h-fit">
            <div
              className="absolute -top-12 -left-12 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none bg-violet-600"
              aria-hidden="true"
            />
            <div className="relative">
              <h3 className="font-display text-sm font-semibold text-text-primary mb-1">Sections</h3>
              <p className="text-[10px] text-text-muted mb-4">10 configuration groups</p>
              <LayoutGroup id="settings-nav">
                <nav className="space-y-1">
                  {SECTIONS.map((s) => {
                    const Icon = s.icon
                    const isActive = active === s.id
                    return (
                      <motion.button
                        key={s.id}
                        type="button"
                        onClick={() => setActive(s.id)}
                        whileTap={reduce ? undefined : { scale: 0.98 }}
                        className={[
                          'relative w-full flex items-center gap-2.5 px-3 h-9 rounded-pill text-sm font-medium',
                          'transition-colors duration-250',
                          isActive
                            ? 'text-text-primary'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
                        ].join(' ')}
                      >
                        {isActive && !reduce && (
                          <motion.span
                            layoutId="settings-nav-pill"
                            className="absolute inset-0 rounded-pill bg-accent/12 border border-accent/30"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        )}
                        {isActive && reduce && (
                          <span className="absolute inset-0 rounded-pill bg-accent/12 border border-accent/30" />
                        )}
                        <Icon className="w-4 h-4 relative z-10 flex-shrink-0" />
                        <span className="relative z-10 truncate">{s.label}</span>
                      </motion.button>
                    )
                  })}
                </nav>
              </LayoutGroup>

              <div className="mt-5 pt-4 border-t border-border-subtle space-y-1">
                <button
                  type="button"
                  onClick={handleExport}
                  className="w-full flex items-center gap-2.5 px-3 h-9 rounded-pill text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Export settings
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2.5 px-3 h-9 rounded-pill text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Import settings
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="w-full flex items-center gap-2.5 px-3 h-9 rounded-pill text-xs text-status-error hover:bg-status-error/10 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset everything
                </button>
              </div>
            </div>
          </Card>

          {/* Content panel */}
          <div className="space-y-5 min-w-0">
            <div className="flex items-center gap-3 px-1">
              <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft flex-shrink-0">
                <activeSection.icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold text-text-primary">{activeSection.label}</h3>
                <p className="text-xs text-text-muted truncate">
                  {active === 'api' && 'Keys stay in localStorage only'}
                  {active === 'story' && 'Defaults for Story Editor'}
                  {active === 'image' && 'Defaults for Image Generator'}
                  {active === 'video' && 'Defaults for Video Generator'}
                  {active === 'export' && 'Defaults for Export page'}
                  {active === 'behavior' && 'Day-to-day app behavior'}
                  {active === 'performance' && 'Timeouts, retries, credit caps'}
                  {active === 'display' && 'Density, scale, motion'}
                  {active === 'privacy' && 'Retention and storage path'}
                  {active === 'developer' && 'API base URL and debug'}
                </p>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
              transition={springTransition(reduce, { duration: 0.22, ease: [0.16, 1, 0.3, 1] })}
            >

        {/* =================================================================
            SECTION 1: API Keys
            ============================================================= */}
        {active === 'api' && (
          <SettingsCard>
            <SectionHeader
              icon={Key}
              title="API Keys"
              subtitle="Stored locally in your browser only. Never sent to a server (except the relevant provider's API)."
            />

            <div className="space-y-4 mt-5">
              <KeyField
                label="Anthropic (Claude)"
                value={draft.anthropicApiKey}
                onChange={set('anthropicApiKey')}
                show={showKey.anthropic}
                onToggleShow={() => setShowKey((s) => ({ ...s, anthropic: !s.anthropic }))}
                placeholder="sk-ant-api03-..."
                status={draft.anthropicApiKey ? 'success' : 'muted'}
                statusLabel={draft.anthropicApiKey ? 'set' : 'not set'}
              />
              <KeyField
                label="Google (Gemini / Imagen)"
                value={draft.googleApiKey}
                onChange={set('googleApiKey')}
                show={showKey.google}
                onToggleShow={() => setShowKey((s) => ({ ...s, google: !s.google }))}
                placeholder="AIzaSy..."
                status={draft.googleApiKey ? 'success' : 'muted'}
                statusLabel={draft.googleApiKey ? 'set' : 'not set'}
              />
              <KeyField
                label="OpenAI (ChatGPT) — Scene Prompts"
                value={draft.openaiApiKey}
                onChange={set('openaiApiKey')}
                show={showKey.openai}
                onToggleShow={() => setShowKey((s) => ({ ...s, openai: !s.openai }))}
                placeholder="sk-proj-… from platform.openai.com"
                status={draft.openaiApiKey ? 'success' : 'muted'}
                statusLabel={draft.openaiApiKey ? 'set' : 'not set'}
              />
              <KeyField
                label="Kaggle tunnel URL"
                value={draft.kaggleTunnelUrl}
                onChange={set('kaggleTunnelUrl')}
                show={showKey.kaggle}
                onToggleShow={() => setShowKey((s) => ({ ...s, kaggle: !s.kaggle }))}
                placeholder="https://xxxx-xx-xx-xxx-xx.ngrok-free.app"
                status={draft.kaggleTunnelUrl ? 'success' : 'error'}
                statusLabel={draft.kaggleTunnelUrl ? 'configured' : 'offline'}
                mono
              />

              <div className="pt-3 border-t border-border">
                <div className="text-xs font-semibold text-text-primary mb-3">Free APIs (Hostinger + TokenLB)</div>
              </div>

              <KeyField
                label="TokenLB API key (primary)"
                value={draft.tokenlbApiKey}
                onChange={set('tokenlbApiKey')}
                show={showKey.tokenlb}
                onToggleShow={() => setShowKey((s) => ({ ...s, tokenlb: !s.tokenlb }))}
                placeholder="sk-… from tokenlb.net/keys"
                status={draft.tokenlbApiKey ? 'success' : 'muted'}
                statusLabel={draft.tokenlbApiKey ? 'set' : 'not set'}
              />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-text-secondary">Extra TokenLB keys (one per line)</span>
                  <Badge color={draft.tokenlbApiKeys?.trim() ? 'success' : 'muted'} dot={!!draft.tokenlbApiKeys?.trim()}>
                    {draft.tokenlbApiKeys?.trim()
                      ? `${draft.tokenlbApiKeys.split('\n').filter((l) => l.trim()).length} extra`
                      : 'optional'}
                  </Badge>
                </div>
                <Input
                  value={draft.tokenlbApiKeys}
                  onChange={set('tokenlbApiKeys')}
                  multiline
                  rows={3}
                  mono
                  inputClassName="resize-none min-h-[72px]"
                  placeholder={'sk-…\nsk-…\n(rotates when one key hits limit)'}
                  spellCheck={false}
                />
              </div>
              <KeyField
                label="TokenLB base URL"
                value={draft.tokenlbBaseUrl}
                onChange={set('tokenlbBaseUrl')}
                show
                placeholder="https://tokenlb.net/v1"
                mono
              />

              <KeyField
                label="Nano Banana key (image)"
                value={draft.nanoApiKey}
                onChange={set('nanoApiKey')}
                show={showKey.nano}
                onToggleShow={() => setShowKey((s) => ({ ...s, nano: !s.nano }))}
                placeholder="USAGIWK"
                status={draft.nanoApiKey ? 'success' : 'muted'}
                statusLabel={draft.nanoApiKey ? 'set' : 'default'}
              />
              <KeyField
                label="Nano Banana URL"
                value={draft.nanoApiUrl}
                onChange={set('nanoApiUrl')}
                show
                placeholder="https://…/nano.php"
                mono
              />

              <KeyField
                label="Durex API key (Insta Pvt)"
                value={draft.durexApiKey}
                onChange={set('durexApiKey')}
                show={showKey.durex}
                onToggleShow={() => setShowKey((s) => ({ ...s, durex: !s.durex }))}
                placeholder="durexapi"
                status={draft.durexApiKey ? 'success' : 'muted'}
                statusLabel={draft.durexApiKey ? 'set' : 'default'}
              />
              <KeyField
                label="Durex API URL"
                value={draft.durexApiUrl}
                onChange={set('durexApiUrl')}
                show
                placeholder="https://…/durex.php"
                mono
              />
              <KeyField
                label="Durex HQ proxy (optional)"
                value={draft.durexProxy}
                onChange={set('durexProxy')}
                show
                placeholder="IP:PORT:USER:PASS"
                mono
              />

              <Hint>
                <strong>Google Pro / Google One subscriptions do NOT unlock Imagen.</strong>{' '}
                The Imagen API requires billing enabled on the AI Studio project.{' '}
                <a className="text-accent-glow underline" href="https://aistudio.google.com/settings/billing" target="_blank" rel="noopener noreferrer">Enable billing →</a>
              </Hint>

              <div className="pt-2 flex items-center gap-2">
                <Button variant="ghost" size="sm" icon={Trash2} onClick={handleClearKeys}>
                  Clear all keys
                </Button>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 2: Story Pipeline defaults
            ============================================================= */}
        {active === 'story' && (
          <SettingsCard>
            <SectionHeader
              icon={BookOpen}
              title="Story Pipeline"
              subtitle="Defaults applied when you start a new story in the Story Editor."
            />

            <div className="space-y-1 mt-5">
              <Row label="Provider">
                <div className="w-72">
                  <Select
                    value={settings.storyProvider}
                    onChange={w('storyProvider')}
                    options={PROVIDERS}
                  />
                </div>
              </Row>
              <Row label="TokenLB model">
                <div className="w-72">
                  <Select
                    value={settings.tokenlbDefaultModel}
                    onChange={w('tokenlbDefaultModel')}
                    options={TOKENLB_MODELS}
                  />
                </div>
              </Row>
              <Row label="Scene prompt provider">
                <div className="w-72">
                  <Select
                    value={settings.scenePromptProvider || 'gemini'}
                    onChange={w('scenePromptProvider')}
                    options={[
                      { value: 'gemini', label: 'Gemini (Google key — default)' },
                      { value: 'openai', label: 'OpenAI direct (sk-proj key)' },
                      { value: 'tokenlb', label: 'TokenLB proxy' },
                    ]}
                  />
                </div>
              </Row>
              <Row label="Gemini model (Scene Prompts)">
                <div className="w-72">
                  <Select
                    value={settings.scenePromptGeminiModel || 'gemini-2.5-flash-lite'}
                    onChange={w('scenePromptGeminiModel')}
                    options={[
                      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (recommended, cheap)' },
                      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (better quality)' },
                      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
                      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
                    ]}
                  />
                </div>
              </Row>
              <Row label="OpenAI model (Scene Prompts)">
                <div className="w-72">
                  <Select
                    value={settings.scenePromptOpenaiModel || 'gpt-4o-mini'}
                    onChange={w('scenePromptOpenaiModel')}
                    options={[
                      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (recommended, cheap)' },
                      { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
                      { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (cheapest)' },
                      { value: 'gpt-4o', label: 'GPT-4o (higher quality)' },
                    ]}
                  />
                </div>
              </Row>
              <Row label="TokenLB model (if using proxy)">
                <div className="w-72">
                  <Select
                    value={settings.scenePromptModel || 'gpt-5.4'}
                    onChange={w('scenePromptModel')}
                    options={TOKENLB_MODELS.filter((m) => m.value.startsWith('gpt-'))}
                  />
                </div>
              </Row>
              <Row label="Default genre">
                <div className="w-56">
                  <Select
                    value={settings.storyDefaultGenre}
                    onChange={w('storyDefaultGenre')}
                    options={GENRES}
                  />
                </div>
              </Row>
              <Row label="Default language">
                <div className="w-48">
                  <Select
                    value={settings.storyDefaultLanguage}
                    onChange={w('storyDefaultLanguage')}
                    options={LANGUAGES}
                  />
                </div>
              </Row>
              <Row label="Default length">
                <div className="w-72">
                  <Select
                    value={settings.storyDefaultLength}
                    onChange={w('storyDefaultLength')}
                    options={LENGTHS}
                  />
                </div>
              </Row>
              <Row label="Max scenes per story">
                <NumberStepper
                  value={settings.storyDefaultMaxScenes}
                  onChange={w('storyDefaultMaxScenes')}
                  min={2} max={20}
                />
              </Row>
              <Row label="Min scene duration (s)">
                <NumberStepper
                  value={settings.storyDefaultMinSceneDuration}
                  onChange={w('storyDefaultMinSceneDuration')}
                  min={1} max={20}
                />
              </Row>
              <Row label="Default image style">
                <div className="w-48">
                  <Select
                    value={settings.storyDefaultStyle}
                    onChange={w('storyDefaultStyle')}
                    options={STYLES}
                  />
                </div>
              </Row>
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-xs text-text-muted mb-1.5">Continuity bible (optional)</div>
              <Input
                multiline
                rows={3}
                value={settings.storyContinuityBible}
                onChange={w('storyContinuityBible')}
                placeholder="e.g. 'Hero has red hair, scar over left eye, always wears a blue coat. Setting: cyberpunk Mumbai, 2089.'"
              />
              <Hint>
                The continuity bible is prepended to every image prompt so the same
                characters look consistent across scenes. Leave blank to skip.
              </Hint>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 3: Image Generation defaults
            ============================================================= */}
        {active === 'image' && (
          <SettingsCard>
            <SectionHeader
              icon={ImageIcon}
              title="Image Generation"
              subtitle="Defaults applied to every new image in the Image Generator and Storyboard."
            />

            <div className="space-y-1 mt-5">
              <Row label="Default engine">
                <div className="w-80">
                  <Select
                    value={settings.imageDefaultEngine}
                    onChange={w('imageDefaultEngine')}
                    options={IMAGE_ENGINES}
                  />
                </div>
              </Row>
              <Row label="Default style">
                <div className="w-48">
                  <Select
                    value={settings.imageDefaultStyle}
                    onChange={w('imageDefaultStyle')}
                    options={STYLES}
                  />
                </div>
              </Row>
              <Row label="Default aspect ratio">
                <div className="w-72">
                  <Select
                    value={settings.imageDefaultAspect}
                    onChange={w('imageDefaultAspect')}
                    options={ASPECTS}
                  />
                </div>
              </Row>
              <Row label="Default resolution">
                <div className="w-40">
                  <Select
                    value={settings.imageDefaultResolution}
                    onChange={w('imageDefaultResolution')}
                    options={RESOLUTIONS}
                  />
                </div>
              </Row>
              <Row label="Variations per call">
                <NumberStepper
                  value={settings.imageDefaultVariations}
                  onChange={w('imageDefaultVariations')}
                  min={1} max={4}
                />
              </Row>
              <Row label="Default seed">
                <div className="flex items-center gap-2">
                  <Input
                    value={settings.imageDefaultSeed}
                    onChange={w('imageDefaultSeed')}
                    placeholder="random"
                    mono
                    className="w-40"
                  />
                  <Switch
                    checked={settings.imageLockSeed}
                    onChange={w('imageLockSeed')}
                    label="Lock seed"
                  />
                </div>
              </Row>
              <Row label="Auto-save to project">
                <Switch
                  checked={settings.imageAutoSaveToProject}
                  onChange={w('imageAutoSaveToProject')}
                  label={settings.imageAutoSaveToProject ? 'On' : 'Off'}
                />
              </Row>
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-xs text-text-muted mb-1.5">Default negative prompt</div>
              <Input
                value={settings.imageDefaultNegative}
                onChange={w('imageDefaultNegative')}
                placeholder="e.g. 'cartoon, blurry, watermark, low quality'"
              />
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 4: Video Generation defaults
            ============================================================= */}
        {active === 'video' && (
          <SettingsCard>
            <SectionHeader
              icon={Video}
              title="Video Generation"
              subtitle="Defaults applied to every new video clip in the Video Generator."
            />

            <div className="space-y-1 mt-5">
              <Row label="Default engine">
                <div className="w-64">
                  <Select
                    value={settings.videoDefaultEngine}
                    onChange={w('videoDefaultEngine')}
                    options={VIDEO_ENGINES}
                  />
                </div>
              </Row>
              <Row label="VEO poll wait (sec)">
                <NumberStepper
                  value={settings.veoPollSeconds}
                  onChange={w('veoPollSeconds')}
                  min={15}
                  max={180}
                />
              </Row>
              <Row label="VEO model version">
                <div className="w-44">
                  <Select
                    value={settings.veoModelVersion}
                    onChange={w('veoModelVersion')}
                    options={[
                      { value: '3.1', label: 'VEO 3.1' },
                      { value: '2.0', label: 'VEO 2.0' },
                      { value: 'seedance-2.0', label: 'Seedance 2.0' },
                      { value: 'seedance', label: 'Seedance 1' },
                    ]}
                  />
                </div>
              </Row>
              <Row label="VEO image model">
                <div className="w-44">
                  <Select
                    value={settings.veoImageModel}
                    onChange={w('veoImageModel')}
                    options={[
                      { value: 'IMAGEN 4', label: 'IMAGEN 4' },
                    ]}
                  />
                </div>
              </Row>
              <Row label="Prompt enhance engine">
                <div className="w-56">
                  <Select
                    value={settings.promptEnhanceEngine}
                    onChange={w('promptEnhanceEngine')}
                    options={[
                      { value: 'veo', label: 'VEO (Gemini prompt)' },
                      { value: 'tokenlb', label: 'TokenLB model' },
                    ]}
                  />
                </div>
              </Row>
              <Row label="Default duration (s)">
                <NumberStepper
                  value={settings.videoDefaultDuration}
                  onChange={w('videoDefaultDuration')}
                  min={1} max={30}
                />
              </Row>
              <Row label="Motion intensity">
                <EngineToggle
                  value={settings.videoDefaultIntensity}
                  onChange={w('videoDefaultIntensity')}
                  options={INTENSITIES}
                />
              </Row>
              <Row label="Frame rate">
                <NumberStepper
                  value={settings.videoDefaultFps}
                  onChange={w('videoDefaultFps')}
                  min={12} max={60} step={1}
                />
              </Row>
              <Row label="Loop clip">
                <Switch
                  checked={settings.videoDefaultLoop}
                  onChange={w('videoDefaultLoop')}
                />
              </Row>
              <Row label="Default camera movement">
                <div className="w-40">
                  <Select
                    value={settings.videoDefaultCameraMovement}
                    onChange={w('videoDefaultCameraMovement')}
                    options={CAMERA_MOVEMENTS}
                  />
                </div>
              </Row>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 5: Export defaults
            ============================================================= */}
        {active === 'export' && (
          <SettingsCard>
            <SectionHeader
              icon={Download}
              title="Export"
              subtitle="Defaults applied when assembling the final video in the Export page."
            />

            <div className="space-y-1 mt-5">
              <Row label="Video aspect">
                <EngineToggle
                  value={settings.exportDefaultAspect}
                  onChange={w('exportDefaultAspect')}
                  options={[
                    { value: '9:16', label: '9:16' },
                    { value: '16:9', label: '16:9' },
                    { value: '1:1',  label: '1:1' },
                  ]}
                />
              </Row>
              <Row label="Scene transition">
                <div className="w-56">
                  <Select
                    value={settings.exportDefaultTransition}
                    onChange={w('exportDefaultTransition')}
                    options={TRANSITIONS}
                  />
                </div>
              </Row>
              <Row label="Transition duration (s)">
                <NumberStepper
                  value={settings.exportDefaultTransitionDuration}
                  onChange={w('exportDefaultTransitionDuration')}
                  min={0} max={3} step={0.1}
                />
              </Row>
              <Row label="Bitrate">
                <div className="w-32">
                  <Input
                    value={settings.exportDefaultBitrate}
                    onChange={w('exportDefaultBitrate')}
                    placeholder="5000k"
                    mono
                  />
                </div>
              </Row>
              <Row label="Include music">
                <Switch
                  checked={settings.exportIncludeAudio}
                  onChange={w('exportIncludeAudio')}
                />
              </Row>
              <Row label="Include subtitles">
                <Switch
                  checked={settings.exportIncludeSubtitles}
                  onChange={w('exportIncludeSubtitles')}
                />
              </Row>
              <Row label="Subtitle style">
                <div className="w-72">
                  <Select
                    value={settings.exportDefaultSubtitleStyle}
                    onChange={w('exportDefaultSubtitleStyle')}
                    options={SUBTITLE_STYLES}
                    disabled={!settings.exportIncludeSubtitles}
                  />
                </div>
              </Row>
              <Row label="Default music file">
                <div className="w-72">
                  <Input
                    value={settings.exportDefaultMusic}
                    onChange={w('exportDefaultMusic')}
                    placeholder="(none)"
                    mono
                  />
                </div>
              </Row>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 6: Behavior toggles
            ============================================================= */}
        {active === 'behavior' && (
          <SettingsCard>
            <SectionHeader
              icon={SettingsIcon}
              title="Behavior"
              subtitle="How the app behaves day-to-day."
            />

            <div className="space-y-1 mt-5">
              <ToggleRow
                label="Auto-save projects"
                desc="Save the active project to disk every 30 seconds and on every successful generation."
                checked={settings.autoSaveProjects}
                onChange={w('autoSaveProjects')}
              />
              <ToggleRow
                label="Confirm before delete"
                desc="Show a 'Are you sure?' dialog before deleting projects, scenes, or assets."
                checked={settings.confirmBeforeDelete}
                onChange={w('confirmBeforeDelete')}
              />
              <ToggleRow
                label="Show advanced controls"
                desc="Reveal extra knobs (seed, continuity bible, etc.) inline in toolbars."
                checked={settings.showAdvancedControls}
                onChange={w('showAdvancedControls')}
              />
              <ToggleRow
                label="UI sound effects"
                desc="Play a soft tick on button clicks and a chime when a generation finishes."
                checked={settings.enableSoundEffects}
                onChange={w('enableSoundEffects')}
              />
              <ToggleRow
                label="Anonymous telemetry"
                desc="Send anonymized usage events (button clicks, errors) to help improve the app. No content ever leaves your machine."
                checked={settings.enableTelemetry}
                onChange={w('enableTelemetry')}
              />
              <ToggleRow
                label="Engine toasts"
                desc="Show a toast notification at the start and end of every generation."
                checked={settings.showEngineToasts}
                onChange={w('showEngineToasts')}
              />
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 7: Performance / limits
            ============================================================= */}
        {active === 'performance' && (
          <SettingsCard>
            <SectionHeader
              icon={Gauge}
              title="Performance"
              subtitle="Tune how the app talks to the backend. Defaults work for most people."
            />

            <div className="space-y-1 mt-5">
              <Row label="Max concurrent generations">
                <NumberStepper
                  value={settings.maxConcurrentGenerations}
                  onChange={w('maxConcurrentGenerations')}
                  min={1} max={8}
                />
              </Row>
              <Row label="Request timeout (s)">
                <NumberStepper
                  value={settings.requestTimeoutSeconds}
                  onChange={w('requestTimeoutSeconds')}
                  min={15} max={600} step={5}
                />
              </Row>
              <Row label="Auto-retry on transient failure">
                <Switch
                  checked={settings.autoRetryOnTransientFailure}
                  onChange={w('autoRetryOnTransientFailure')}
                />
              </Row>
              <Row label="Max retries">
                <NumberStepper
                  value={settings.maxRetries}
                  onChange={w('maxRetries')}
                  min={0} max={5}
                  disabled={!settings.autoRetryOnTransientFailure}
                />
              </Row>
              <Row label="Retry backoff (s)">
                <NumberStepper
                  value={settings.retryBackoffSeconds}
                  onChange={w('retryBackoffSeconds')}
                  min={1} max={30}
                  disabled={!settings.autoRetryOnTransientFailure}
                />
              </Row>
            </div>

            <Hint>
              Retry uses exponential backoff: with backoff=2 and maxRetries=2,
              it waits 2s, then 4s before giving up.
            </Hint>

            <div className="mt-6 pt-6 border-t border-border">
              <SectionHeader
                icon={Activity}
                title="API credit protection"
                subtitle="Daily caps protect your TokenLB / Nano / VEO / Durex keys. Resets at UTC midnight."
              />
              <div className="space-y-1 mt-4">
                <ToggleRow
                  label="Enable daily limits"
                  desc="Block calls when today's cap is reached (recommended)."
                  checked={settings.enableApiUsageLimits}
                  onChange={w('enableApiUsageLimits')}
                />
                <Row label="TokenLB calls / key / day">
                  <NumberStepper
                    value={settings.tokenlbDailyLimit}
                    onChange={w('tokenlbDailyLimit')}
                    min={1} max={200}
                    disabled={!settings.enableApiUsageLimits}
                  />
                </Row>
                <Row label="Max tokens / TokenLB call">
                  <NumberStepper
                    value={settings.tokenlbMaxTokens}
                    onChange={w('tokenlbMaxTokens')}
                    min={400} max={4096} step={100}
                    disabled={!settings.enableApiUsageLimits}
                  />
                </Row>
                <ToggleRow
                  label="Credit saver mode"
                  desc="Uses Gemini Flash / GPT mini + lower token caps on all story tasks."
                  checked={settings.tokenlbCreditSaver}
                  onChange={w('tokenlbCreditSaver')}
                />
                <Row label="Nano images / day">
                  <NumberStepper
                    value={settings.nanoDailyLimit}
                    onChange={w('nanoDailyLimit')}
                    min={1} max={100}
                    disabled={!settings.enableApiUsageLimits}
                  />
                </Row>
                <Row label="VEO calls / day">
                  <NumberStepper
                    value={settings.veoDailyLimit}
                    onChange={w('veoDailyLimit')}
                    min={1} max={50}
                    disabled={!settings.enableApiUsageLimits}
                  />
                </Row>
                <Row label="Durex transforms / day">
                  <NumberStepper
                    value={settings.durexDailyLimit}
                    onChange={w('durexDailyLimit')}
                    min={1} max={50}
                    disabled={!settings.enableApiUsageLimits}
                  />
                </Row>
              </div>

              {usageStats?.providers && (
                <div className="mt-4 space-y-2">
                  <div className="text-[11px] text-text-muted uppercase tracking-widest">
                    Today (UTC {usageStats.date_utc})
                  </div>
                  {Object.entries(usageStats.providers).map(([name, stat]) => (
                    <div key={name} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary capitalize">{name}</span>
                      <span className="font-mono text-text-primary">
                        {stat.used} / {stat.limit ?? '∞'}
                        {stat.remaining != null && stat.percent >= 80 && (
                          <span className="ml-2 text-status-warning">low</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {usageStats?.tokenlb_keys?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                      <div className="text-[11px] text-text-muted uppercase tracking-widest">
                        TokenLB per key ({usageStats.tokenlb_per_key_limit ?? '∞'} each)
                      </div>
                      {usageStats.tokenlb_keys.map((row) => (
                        <div key={row.label} className="flex items-center justify-between text-xs">
                          <span className="font-mono text-text-secondary">{row.label}</span>
                          <span className="font-mono text-text-primary">
                            {row.used} / {row.limit ?? '∞'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Hint>
                Each TokenLB key gets its own daily cap (default 15). With 3 keys that is up to 45 story calls/day.
                Keys rotate automatically when one hits limit or returns 429.
              </Hint>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 8: Display & accessibility
            ============================================================= */}
        {active === 'display' && (
          <SettingsCard>
            <SectionHeader
              icon={Palette}
              title="Display"
              subtitle="How the app looks. The dark theme is locked for now (more themes coming in Phase 5)."
            />

            <div className="space-y-1 mt-5">
              <Row label="UI density">
                <EngineToggle
                  value={settings.uiDensity}
                  onChange={w('uiDensity')}
                  options={DENSITIES}
                />
              </Row>
              <Row label="Font scale">
                <EngineToggle
                  value={String(settings.fontScale)}
                  onChange={(v) => settings.setFontScale(parseFloat(v))}
                  options={FONT_SCALES}
                />
              </Row>
              <Row label="Reduce motion">
                <div>
                  <Switch
                    checked={settings.reduceMotion}
                    onChange={w('reduceMotion')}
                  />
                  <p className="text-[10px] text-text-muted mt-1">Disables decorative animations and the magnetic button effect.</p>
                </div>
              </Row>
              <Row label="Color-blind safe palette">
                <Switch
                  checked={settings.colorBlindSafePalette}
                  onChange={w('colorBlindSafePalette')}
                />
              </Row>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 9: Privacy & data
            ============================================================= */}
        {active === 'privacy' && (
          <SettingsCard>
            <SectionHeader
              icon={ShieldCheck}
              title="Privacy & Data"
              subtitle="Where your data lives and how long we keep it."
            />

            <ul className="space-y-3 text-sm text-text-secondary mt-5">
              <Bullet>API keys stored only in your browser's localStorage.</Bullet>
              <Bullet>Project files stay in <code className="font-mono text-text-primary">studio/storage/</code>.</Bullet>
              <Bullet>The only network calls are to Google, Anthropic, and your own Kaggle tunnel.</Bullet>
            </ul>

            <div className="mt-5 pt-5 border-t border-border space-y-1">
              <Row label="Project history retention (days)">
                <NumberStepper
                  value={settings.projectHistoryRetentionDays}
                  onChange={w('projectHistoryRetentionDays')}
                  min={7} max={365} step={1}
                />
              </Row>
              <Row label="Keep generation logs in browser">
                <Switch
                  checked={settings.storeGenerationLogs}
                  onChange={w('storeGenerationLogs')}
                />
              </Row>
              <Row label="Max local generations kept">
                <NumberStepper
                  value={settings.maxLocalGenerationsKept}
                  onChange={w('maxLocalGenerationsKept')}
                  min={10} max={500} step={10}
                  disabled={!settings.storeGenerationLogs}
                />
              </Row>
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <Row label="Storage path">
                <div className="w-72">
                  <Select
                    value={settings.storagePath}
                    onChange={w('storagePath')}
                    options={STORAGE_OPTIONS}
                  />
                </div>
              </Row>
              <p className="text-[10px] text-text-muted mt-2">
                Back this folder up — it holds every generated asset, image variant, and clip.
              </p>
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <div className="text-sm font-medium text-text-primary mb-2">Storage used</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <UsageCard label="Kaggle GPU"  value="0 / 30" unit="hrs / week"  tone="violet" />
                <UsageCard label="Claude API"  value="0"      unit="requests"   tone="gold" />
                <UsageCard label="Gemini API"  value="0"      unit="requests"   tone="info" />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleResetAll}>
                Reset all settings
              </Button>
            </div>
          </SettingsCard>
        )}

        {/* =================================================================
            SECTION 10: Developer
            ============================================================= */}
        {active === 'developer' && (
          <SettingsCard>
            <SectionHeader
              icon={Code}
              title="Developer"
              subtitle="Low-level knobs. Most people don't need to touch these."
            />

            <div className="space-y-1 mt-5">
              <Row label="API base URL">
                <div className="w-96">
                  <Input
                    value={settings.apiBaseUrl}
                    onChange={w('apiBaseUrl')}
                    placeholder="(empty = use Vite proxy at /api)"
                    mono
                  />
                </div>
              </Row>
              <Row label="Log level">
                <div className="w-56">
                  <Select
                    value={settings.logLevel}
                    onChange={w('logLevel')}
                    options={LOG_LEVELS}
                  />
                </div>
              </Row>
              <Row label="Custom headers (JSON)">
                <div className="w-96">
                  <Input
                    multiline
                    rows={3}
                    value={JSON.stringify(settings.customHeaders, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value)
                        settings.setCustomHeaders(parsed)
                      } catch {
                        // ignore parse errors; user is mid-typing
                      }
                    }}
                    placeholder='{"X-Project-Name": "vyom"}'
                    mono
                  />
                </div>
              </Row>
              <Row label="Raw response debug">
                <div>
                  <Switch
                    checked={settings.rawResponseDebug}
                    onChange={w('rawResponseDebug')}
                  />
                  <p className="text-[10px] text-text-muted mt-1">Log full axios responses to the browser console.</p>
                </div>
              </Row>
            </div>

            <Hint>
              All these settings live in <code>localStorage</code> under the
              key <code>dadaji-studio-settings</code>. Clear it from DevTools
              → Application → Local Storage to fully reset.
            </Hint>
          </SettingsCard>
        )}

            </motion.div>
            </AnimatePresence>

            {/* Save bar — API Keys section uses draft state */}
            {active === 'api' && (
              <Card className="sticky bottom-4 z-10 !p-0 overflow-hidden border-accent/20 shadow-glow-violet-soft">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-bg-elevated/90 backdrop-blur-md">
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {saved ? (
                      <span className="inline-flex items-center gap-1.5 text-status-success">
                        <Check className="w-3.5 h-3.5" />
                        Saved to localStorage
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-accent-glow" />
                        API keys save on submit — other sections update instantly
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleClearKeys} icon={Trash2}>
                      Clear keys
                    </Button>
                    <MagneticButton>
                      <Button onClick={handleSave} icon={Save}>
                        Save changes
                      </Button>
                    </MagneticButton>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </Section>
    </Root>
  )
}

/* ============================================================
   Subcomponents
   ============================================================ */

function SettingsCard({ children, className = '' }) {
  return (
    <Card className={['relative overflow-hidden', className].filter(Boolean).join(' ')}>
      <div
        className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-[0.07] pointer-events-none bg-violet-600"
        aria-hidden="true"
      />
      <div className="relative">{children}</div>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 relative">
      <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft flex-shrink-0">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  )
}

function Hint({ children }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-input bg-bg-base/40 border border-border-subtle text-xs text-text-muted mt-3">
      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <div>{children}</div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end w-full sm:w-auto">{children}</div>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div>
        <div className="text-sm text-text-secondary">{label}</div>
        {desc && <div className="text-[11px] text-text-muted mt-0.5">{desc}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function Bullet({ children }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-4 h-4 text-status-success mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </li>
  )
}

function KeyField({ label, value, onChange, show, onToggleShow, placeholder, status, statusLabel, mono }) {
  const canToggle = typeof onToggleShow === 'function'
  const inputType = canToggle ? (show ? 'text' : 'password') : 'text'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary">{label}</span>
        {statusLabel && <Badge color={status} dot pulse={status === 'success'}>{statusLabel}</Badge>}
      </div>
      <div className="relative">
        <Input
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          mono={mono}
          inputClassName={canToggle ? 'pr-10' : undefined}
        />
        {canToggle && (
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

function UsageCard({ label, value, unit, tone }) {
  const tones = {
    violet: 'border-accent/30 shadow-glow-violet-soft',
    gold:   'border-accent-secondary/30 shadow-glow-gold',
    info:   'border-status-info/30',
  }
  return (
    <div className={['relative overflow-hidden p-4 rounded-[18px] bg-bg-elevated/60 border', tones[tone] || tones.violet].join(' ')}>
      <div className="text-[10px] text-text-muted uppercase tracking-widest">{label}</div>
      <div className="font-display text-2xl font-bold text-text-primary mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{unit}</div>
    </div>
  )
}

/* ------------------------------------------------------------
   Switch — a small, reusable on/off pill.
   ------------------------------------------------------------ */
function Switch({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || 'Toggle'}
        onClick={() => onChange?.(!checked)}
        className={[
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-bg-elevated border border-border',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
          aria-hidden="true"
        />
      </button>
      {label && <span className="text-xs text-text-muted">{label}</span>}
    </label>
  )
}

/* ------------------------------------------------------------
   NumberStepper — input + - / + buttons. Used everywhere a
   numeric setting needs fine-grained control.
   ------------------------------------------------------------ */
function NumberStepper({ value, onChange, min = 0, max = 999, step = 1, disabled = false }) {
  const v = Number.isFinite(value) ? value : 0
  const clamp = (n) => Math.max(min, Math.min(max, n))
  return (
    <div className={['inline-flex items-center rounded-input border bg-bg-elevated',
      disabled ? 'border-border-subtle opacity-50' : 'border-border'].join(' ')}>
      <button
        type="button"
        disabled={disabled || v <= min}
        onClick={() => onChange(clamp(v - step))}
        className="w-7 h-7 text-text-muted hover:text-text-primary hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent rounded-l-input transition-colors"
      >−</button>
      <input
        type="number"
        value={v}
        disabled={disabled}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(clamp(n))
        }}
        className="w-14 h-7 text-center text-sm bg-transparent text-text-primary font-mono outline-none"
      />
      <button
        type="button"
        disabled={disabled || v >= max}
        onClick={() => onChange(clamp(v + step))}
        className="w-7 h-7 text-text-muted hover:text-text-primary hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent rounded-r-input transition-colors"
      >+</button>
    </div>
  )
}
