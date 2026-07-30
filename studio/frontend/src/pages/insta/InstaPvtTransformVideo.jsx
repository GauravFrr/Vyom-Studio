import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Lock, Upload, Video, Sparkles, Download, Copy, Wand2, ArrowLeft, Play, Pause,
} from 'lucide-react'
import { pvtApi } from '../../api/client'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import ProgressBar from '../../components/ui/ProgressBar'
import FriendlyError from '../../components/ui/FriendlyError'
import MagneticButton from '../../components/MagneticButton'
import { useToast } from '../../components/ui/Toast'
import useSettingsStore from '../../store/settingsStore'
import useMotionPreference from '../../hooks/useMotionPreference'
import { pageStagger, fadeUp, revealVariants, readVideoFile } from './instaMotion'

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return <motion.section variants={fadeUp} className={className}>{children}</motion.section>
}

export default function InstaPvtTransformVideo() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [videoPreview, setVideoPreview] = useState(null)
  const [videoData, setVideoData] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [playing, setPlaying] = useState(false)
  const fileInputRef = useRef(null)
  const resultRef = useRef(null)
  const proxySet = Boolean(useSettingsStore.getState().durexProxy?.trim())

  const handleFile = async (file) => {
    const data = await readVideoFile(file, toast)
    if (!data) return
    setVideoData(data)
    setVideoPreview(URL.createObjectURL(file))
  }

  const handleGenerate = async () => {
    if (!videoData) {
      toast({ kind: 'violet', title: 'Video required', message: 'Upload a source clip first.' })
      return
    }
    if (!prompt.trim()) {
      toast({ kind: 'violet', title: 'Prompt required', message: 'Describe the transformation you want.' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await pvtApi.transformVideo({ prompt: prompt.trim(), video_base64: videoData })
      if (res.data?.success) {
        const item = { ...res.data, prompt, createdAt: new Date() }
        setCurrent(item)
        setHistory((h) => [item, ...h].slice(0, 6))
        toast({ kind: 'success', title: 'Done', message: 'Durex video transform complete.' })
      } else {
        setError(res.data?.message || res.data?.detail || 'Video transform failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Video transform failed.')
    } finally {
      setLoading(false)
    }
  }

  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-10 lg:space-y-12 pb-6' }
    : { className: 'space-y-10 lg:space-y-12 pb-6', initial: 'hidden', animate: 'visible', variants: pageStagger }

  return (
    <Root {...rootProps}>
      <Section reduce={reduce}>
        <Link to="/insta-pvt" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-accent-glow mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Insta toolkit
        </Link>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-5">
          <Lock className="w-3 h-3" />
          Durex transform · video
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Pvt <span className="text-gradient-violet">reel</span> edit
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Video + prompt → exclusive Instagram-style clip transformation via Durex AI (same flow as photo transform).
        </p>
      </Section>

      <Section reduce={reduce}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-28">
            <Card className="relative overflow-hidden">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-button bg-gradient-to-br from-pink-600 to-violet-600 flex items-center justify-center shadow-glow-violet-soft">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Source video</h3>
                  <p className="text-sm text-text-muted mt-0.5">MP4 / WebM · up to 40MB</p>
                </div>
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
                className={[
                  'border-2 border-dashed rounded-[18px] p-4 cursor-pointer min-h-[180px] transition-all duration-300',
                  dragOver ? 'border-accent bg-accent/10' : 'border-border-subtle bg-bg-base/30 hover:border-accent/40',
                ].join(' ')}
              >
                {videoPreview ? (
                  <video src={videoPreview} className="w-full rounded-input max-h-56" muted playsInline controls />
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Video className="w-8 h-8 text-text-muted mb-2" />
                    <p className="text-sm text-text-secondary">Drop video or click to browse</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
              <div className="mt-5">
                <Input
                  label="Transform prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  multiline
                  rows={5}
                  placeholder="Describe the exclusive / private Instagram-style video edit you want…"
                  inputClassName="min-h-[120px]"
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-text-muted">
                <Badge color={proxySet ? 'success' : 'muted'}>{proxySet ? 'HQ proxy on' : 'No proxy'}</Badge>
                <span>Settings → API Keys → Durex</span>
              </div>
              {error && <div className="mt-4"><FriendlyError error={error} /></div>}
              <div className="mt-6 pt-6 border-t border-border-subtle">
                <MagneticButton strength={reduce ? 0 : 4} className="w-full">
                  <Button onClick={handleGenerate} loading={loading} fullWidth size="lg" icon={Sparkles} className="!h-14">
                    {loading ? 'Transforming…' : 'Generate pvt video'}
                  </Button>
                </MagneticButton>
              </div>
            </Card>
          </div>

          <div className="xl:col-span-7">
            <Card className="relative overflow-hidden min-h-[360px]">
              <div className="flex items-center gap-3 mb-6">
                <Wand2 className="w-5 h-5 text-accent-glow" />
                <div>
                  <h3 className="font-display text-lg font-semibold text-text-primary">Result</h3>
                  <p className="text-xs text-text-muted">{loading ? 'Durex processing…' : 'Output appears here'}</p>
                </div>
              </div>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="load" initial={false} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="aspect-video max-h-[480px] mx-auto rounded-[20px] skeleton border border-border-subtle" />
                    <ProgressBar indeterminate />
                    <p className="text-sm text-text-secondary text-center">Durex AI video · may take 1–3 min</p>
                  </motion.div>
                ) : current?.video_url ? (
                  <motion.div key="out" variants={reduce ? undefined : revealVariants} initial={reduce ? false : 'hidden'} animate="visible" className="space-y-4">
                    <div className="relative rounded-[20px] overflow-hidden border border-border-subtle shadow-glow-violet-soft">
                      <video
                        ref={resultRef}
                        src={current.video_url}
                        className="w-full aspect-video object-cover"
                        loop
                        muted
                        playsInline
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                      />
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const v = resultRef.current
                            if (!v) return
                            if (v.paused) v.play()
                            else v.pause()
                          }}
                          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white"
                        >
                          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        <Badge color="violet">{current.engine || 'durex-video'}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={current.video_url} download target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" icon={Download}>Download</Button>
                      </a>
                      <Button variant="ghost" size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(current.video_url)}>Copy URL</Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="empty" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                    <EmptyState icon={Video} title="No output yet" description="Upload a video, write a prompt, and hit Generate." />
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
            {history.length > 1 && (
              <Card className="mt-6">
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">History</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {history.slice(1).map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrent(h)}
                      className="rounded-input overflow-hidden border border-border-subtle hover:border-accent/50 aspect-video bg-bg-elevated flex items-center justify-center"
                    >
                      <Video className="w-5 h-5 text-text-muted" />
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </Section>
    </Root>
  )
}
