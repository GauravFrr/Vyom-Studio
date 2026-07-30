import { useState, useRef } from 'react'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Mic, Sparkles, Download, Play, Pause, Volume2, Languages,
  AudioLines, Clock, User, Gauge,
} from 'lucide-react'
import { generateApi, resolveMediaUrl } from '../api/client'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import ProgressBar from '../components/ui/ProgressBar'
import FriendlyError from '../components/ui/FriendlyError'
import MagneticButton from '../components/MagneticButton'
import { useToast } from '../components/ui/Toast'
import useSettingsStore from '../store/settingsStore'
import { mediaPathForStorage, writeVoiceoverForExport } from '../utils/sceneAssets'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

// Curated Microsoft neural voices (300+ available in the TTS API).
const VOICES = [
  { value: 'hi-IN-MadhurNeural',  name: 'Madhur',  lang: 'Hindi',          gender: 'M', flag: 'IN' },
  { value: 'hi-IN-SwaraNeural',   name: 'Swara',   lang: 'Hindi',          gender: 'F', flag: 'IN' },
  { value: 'en-IN-PrabhatNeural', name: 'Prabhat', lang: 'English (IN)',   gender: 'M', flag: 'IN' },
  { value: 'en-IN-NeerjaNeural',  name: 'Neerja',  lang: 'English (IN)',   gender: 'F', flag: 'IN' },
  { value: 'en-US-GuyNeural',     name: 'Guy',     lang: 'English (US)',   gender: 'M', flag: 'US' },
  { value: 'en-US-AriaNeural',    name: 'Aria',    lang: 'English (US)',   gender: 'F', flag: 'US' },
  { value: 'en-GB-RyanNeural',    name: 'Ryan',    lang: 'English (UK)',   gender: 'M', flag: 'GB' },
  { value: 'en-GB-SoniaNeural',   name: 'Sonia',   lang: 'English (UK)',   gender: 'F', flag: 'GB' },
  { value: 'ur-IN-SalmanNeural',  name: 'Salman',  lang: 'Urdu (IN)',      gender: 'M', flag: 'IN' },
  { value: 'ur-IN-GulNeural',     name: 'Gul',     lang: 'Urdu (IN)',      gender: 'F', flag: 'IN' },
  { value: 'bn-IN-BashkarNeural', name: 'Bashkar', lang: 'Bengali (IN)',   gender: 'M', flag: 'IN' },
  { value: 'ta-IN-ValluvarNeural', name: 'Valluvar', lang: 'Tamil (IN)',   gender: 'M', flag: 'IN' },
]

const EMOTIONS = [
  { value: 'default',      label: 'Default' },
  { value: 'storyteller',  label: 'Storyteller' },
  { value: 'warm',         label: 'Warm' },
  { value: 'calm',         label: 'Calm' },
  { value: 'happy',        label: 'Happy' },
  { value: 'sad',          label: 'Sad' },
  { value: 'excited',      label: 'Excited' },
  { value: 'professional', label: 'Pro' },
]

const SPEEDS = [0.75, 1.0, 1.25, 1.5]

const pageStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: SMOOTH_EASE } },
}

const gridStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

const revealVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: SMOOTH_EASE } },
}

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return <motion.section variants={fadeUp} className={className}>{children}</motion.section>
}

function langFromVoice(voice) {
  return voice?.split('-').slice(0, 2).join('-') || 'en-US'
}

export default function Voiceover() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const settings = useSettingsStore.getState()

  const [text, setText] = useState('')
  const [voice, setVoice] = useState(settings.ttsDefaultVoice || 'hi-IN-MadhurNeural')
  const [emotion, setEmotion] = useState(settings.ttsDefaultEmotion || 'storyteller')
  const [speed, setSpeed] = useState(settings.ttsDefaultSpeed || 1.0)
  const [pitch, setPitch] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  const selectedVoice = VOICES.find((v) => v.value === voice) || VOICES[0]

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast({ kind: 'violet', title: 'Text required', message: 'Paste your script or voiceover text first.' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await generateApi.generateTts({
        text: text.trim(),
        voice,
        lang: langFromVoice(voice),
        speed,
        pitch,
        emotion,
      })
      if (res.data?.success) {
        const audioUrl = resolveMediaUrl(res.data.audio_url)
        const item = {
          ...res.data,
          audio_url: audioUrl,
          text: text.trim(),
          voiceName: selectedVoice.name,
          voiceLang: selectedVoice.lang,
          createdAt: new Date(),
        }
        setCurrent(item)
        setHistory((h) => [item, ...h].slice(0, 10))
        writeVoiceoverForExport({
          audio_url: mediaPathForStorage(res.data.audio_url || res.data.audio_path),
          text: text.trim(),
          voice,
        })
        toast({ kind: 'success', title: 'Voiceover ready', message: `${selectedVoice.name} · ${selectedVoice.lang}` })
      } else {
        setError(res.data?.message || res.data?.detail || 'Voice generation failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Voice generation failed.')
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
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-status-success animate-pulse" />
          Voice engine
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Give your story <span className="text-gradient-violet">a voice</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Microsoft neural voices in Hindi, English, Urdu, Bengali, Tamil and 100+ more languages.
          Paste a script, pick a narrator, download the MP3 — perfect for Dadaji stories.
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
          <QuickStat icon={User} label="Voice" value={selectedVoice.name} accent="#7C3AED" reduce={reduce} />
          <QuickStat icon={Languages} label="Language" value={selectedVoice.lang} accent="#06B6D4" reduce={reduce} />
          <QuickStat icon={Gauge} label="Speed" value={`${speed}×`} accent="#3B82F6" reduce={reduce} />
          <QuickStat icon={AudioLines} label="History" value={history.length} accent="#F59E0B" reduce={reduce} />
        </motion.div>
      </Section>

      {/* Workspace */}
      <Section reduce={reduce}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          {/* Controls rail */}
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-28">
            {/* Script */}
            <Card>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-button bg-gradient-to-br from-accent to-[#4F46E5] flex items-center justify-center shadow-glow-violet-soft">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Script</h3>
                  <p className="text-sm text-text-muted mt-0.5">Up to 9,500 characters per clip</p>
                </div>
              </div>
              <Input
                label="What should the narrator say?"
                value={text}
                onChange={(e) => setText(e.target.value)}
                multiline
                rows={7}
                maxLength={9500}
                placeholder="एक समय की बात है, एक छोटे से गाँव में…"
                inputClassName="!text-base !leading-relaxed min-h-[160px]"
              />
              <p className="mt-2 text-[11px] text-text-muted text-right font-mono">
                {text.length.toLocaleString()} / 9,500
              </p>

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
                    disabled={!text.trim()}
                  >
                    {loading ? 'Generating voice…' : 'Generate voiceover'}
                  </Button>
                </MagneticButton>
              </div>
            </Card>

            {/* Voice picker */}
            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-4">Narrator voice</p>
              <LayoutGroup>
                <div className="grid grid-cols-2 gap-2">
                  {VOICES.map((v) => {
                    const selected = voice === v.value
                    return (
                      <motion.button
                        key={v.value}
                        type="button"
                        onClick={() => setVoice(v.value)}
                        whileTap={reduce ? undefined : { scale: 0.97 }}
                        className={[
                          'relative flex items-center gap-2.5 px-3 h-14 rounded-button border text-left',
                          'transition-colors duration-250',
                          selected ? 'border-accent/50 text-text-primary' : 'border-border-subtle text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        {selected && !reduce && (
                          <motion.span
                            layoutId="voice-pill"
                            className="absolute inset-0 rounded-button bg-accent/12 border border-accent/35"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <span
                          className={[
                            'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                            v.gender === 'M' ? 'bg-blue-500/20 text-blue-300' : 'bg-pink-500/20 text-pink-300',
                          ].join(' ')}
                        >
                          {v.name[0]}
                        </span>
                        <span className="relative z-10 min-w-0">
                          <span className="block text-sm font-medium truncate">{v.name}</span>
                          <span className="block text-[10px] text-text-muted truncate">{v.lang} · {v.gender === 'M' ? 'Male' : 'Female'}</span>
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>
            </Card>

            {/* Tone + speed */}
            <Card>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium mb-3">Tone</p>
              <div className="flex flex-wrap gap-2">
                {EMOTIONS.map((e) => {
                  const selected = emotion === e.value
                  return (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => setEmotion(e.value)}
                      className={[
                        'px-3.5 h-9 rounded-pill border text-xs font-medium transition-colors duration-200',
                        selected
                          ? 'border-accent/50 bg-accent/12 text-text-primary'
                          : 'border-border-subtle text-text-secondary hover:border-accent/30',
                      ].join(' ')}
                    >
                      {e.label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 pt-6 border-t border-border-subtle space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Speaking speed</span>
                    <span className="text-sm font-mono text-accent-glow">{speed}×</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={[
                          'h-10 rounded-button border text-sm font-mono font-medium transition-colors',
                          speed === s
                            ? 'border-accent/50 bg-accent/12 text-text-primary'
                            : 'border-border-subtle text-text-secondary hover:border-accent/30',
                        ].join(' ')}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">Pitch</span>
                    <span className="text-sm font-mono text-accent-glow">{pitch > 0 ? `+${pitch}` : pitch}%</span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={20}
                    step={5}
                    value={pitch}
                    onChange={(e) => setPitch(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1.5">
                    <span>Lower</span><span>Normal</span><span>Higher</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Output theater */}
          <div className="xl:col-span-7 space-y-6">
            <Card className="relative overflow-hidden min-h-[300px]">
              <div
                className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-accent/[0.06] to-transparent pointer-events-none"
                aria-hidden="true"
              />

              <div className="relative flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-button bg-bg-elevated border border-border-subtle flex items-center justify-center">
                    <Volume2 className="w-4 h-4 text-accent-glow" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text-primary">Playback</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {loading ? 'Synthesizing speech…' : current?.audio_url ? 'Latest voiceover' : 'Audio appears here'}
                    </p>
                  </div>
                </div>
                {current?.audio_url && !loading && (
                  <a
                    href={current.audio_url}
                    download={`vyom-voiceover-${Date.now()}.mp3`}
                    className="p-2.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 border border-transparent hover:border-border-subtle transition-all duration-200"
                    title="Download MP3"
                  >
                    <Download className="w-4 h-4" />
                  </a>
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
                    <div className="h-24 rounded-[20px] skeleton border border-border-subtle" />
                    <ProgressBar indeterminate />
                    <p className="text-sm text-text-secondary text-center">
                      <span className="text-accent-glow font-medium">{selectedVoice.name}</span> is reading your script…
                    </p>
                  </motion.div>
                ) : current?.audio_url ? (
                  <motion.div
                    key="result"
                    variants={reduce ? undefined : revealVariants}
                    initial={reduce ? false : 'hidden'}
                    animate="visible"
                    exit={reduce ? undefined : { opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className="relative rounded-[20px] border border-border-subtle bg-bg-elevated p-5 shadow-glow-violet-soft">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => {
                            const a = audioRef.current
                            if (!a) return
                            if (a.paused) a.play()
                            else a.pause()
                          }}
                          className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-white hover:bg-accent/80 transition-colors flex-shrink-0 shadow-glow-violet"
                        >
                          {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {current.voiceName} · {current.voiceLang}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {(current.metadata?.characters || 0).toLocaleString()} chars ·{' '}
                            {((current.metadata?.bytes || 0) / 1024).toFixed(0)} KB MP3
                          </p>
                          <audio
                            ref={audioRef}
                            src={current.audio_url}
                            className="w-full mt-3"
                            controls
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onEnded={() => setPlaying(false)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-[18px] bg-bg-elevated/50 border border-border-subtle">
                      <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">{current.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge color="violet">{current.voiceName}</Badge>
                        <Badge color="muted"><Languages className="w-3 h-3" />{current.voiceLang}</Badge>
                        <Badge color="muted"><Gauge className="w-3 h-3" />{current.metadata?.speed || speed}×</Badge>
                        <Badge color="muted">{EMOTIONS.find((e) => e.value === (current.metadata?.emotion || emotion))?.label}</Badge>
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
                    <EmptyState
                      icon={Mic}
                      title="No voiceover yet"
                      description="Paste your story script, pick a narrator like Madhur (Hindi), and generate. The MP3 plays here and saves to storage."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* History */}
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
                    <div className="space-y-2">
                      {history.map((h, i) => (
                        <button
                          key={`${h.audio_url}-${i}`}
                          type="button"
                          onClick={() => setCurrent(h)}
                          className="w-full flex items-center gap-3 p-3 rounded-[14px] border border-border-subtle hover:border-accent/40 transition-colors text-left group"
                        >
                          <span className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                            <AudioLines className="w-4 h-4 text-accent-glow" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-text-primary truncate">{h.text}</span>
                            <span className="block text-[10px] text-text-muted mt-0.5">
                              {h.voiceName} · {h.voiceLang} · {((h.metadata?.bytes || 0) / 1024).toFixed(0)} KB
                            </span>
                          </span>
                          <Clock className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </button>
                      ))}
                    </div>
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
