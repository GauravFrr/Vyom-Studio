import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Clapperboard, Upload, Sparkles, Download, ArrowLeft, User, Video, Play, Pause,
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
import { pageStagger, fadeUp, revealVariants, readImageFile, readVideoFile } from './instaMotion'

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return <motion.section variants={fadeUp} className={className}>{children}</motion.section>
}

export default function InstaFaceVideo() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [videoPreview, setVideoPreview] = useState(null)
  const [videoData, setVideoData] = useState(null)
  const [facePreview, setFacePreview] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [dragVideo, setDragVideo] = useState(false)
  const [dragFace, setDragFace] = useState(false)
  const videoRef = useRef(null)
  const resultRef = useRef(null)
  const videoInputRef = useRef(null)
  const faceInputRef = useRef(null)
  const kaggleSet = Boolean(useSettingsStore.getState().kaggleTunnelUrl?.trim())

  const handleVideo = async (file) => {
    const data = await readVideoFile(file, toast)
    if (!data) return
    setVideoData(data)
    setVideoPreview(URL.createObjectURL(file))
  }

  const handleFace = async (file) => {
    const data = await readImageFile(file, toast)
    if (data) setFacePreview(data)
  }

  const handleGenerate = async () => {
    if (!videoData) {
      toast({ kind: 'violet', title: 'Video required', message: 'Upload a reference reel or clip.' })
      return
    }
    if (!facePreview) {
      toast({ kind: 'violet', title: 'Face required', message: 'Upload your model face photo.' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await pvtApi.faceSwapVideo({
        video_base64: videoData,
        face_base64: facePreview,
        notes: notes.trim() || undefined,
      })
      if (res.data?.success) {
        setCurrent(res.data)
        toast({ kind: 'success', title: 'Clip ready', message: 'Face-swapped video generated.' })
      } else {
        setError(res.data?.message || res.data?.detail || 'Face swap failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Face swap failed.')
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
          <Clapperboard className="w-3 h-3" />
          Face swap · video
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Your model in <span className="text-gradient-violet">any reel</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Reference video = motion & timing. Model photo = face identity. Output = your AI influencer performing the same clip.
        </p>
      </Section>

      <Section reduce={reduce}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-28">
            <Card className="relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-[0.1] pointer-events-none bg-cyan-500" />
              <div className="relative space-y-5">
                <div>
                  <Badge color="muted" className="mb-3">Step 1 · Reference video</Badge>
                  <div
                    onClick={() => videoInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragVideo(true) }}
                    onDragLeave={() => setDragVideo(false)}
                    onDrop={async (e) => {
                      e.preventDefault()
                      setDragVideo(false)
                      await handleVideo(e.dataTransfer.files?.[0])
                    }}
                    className={[
                      'border-2 border-dashed rounded-[18px] p-4 cursor-pointer transition-all duration-300',
                      dragVideo ? 'border-accent bg-accent/10' : 'border-border-subtle bg-bg-base/30 hover:border-accent/40',
                    ].join(' ')}
                  >
                    {videoPreview ? (
                      <video src={videoPreview} className="w-full rounded-input max-h-48" muted playsInline />
                    ) : (
                      <div className="flex flex-col items-center py-8 text-center">
                        <Video className="w-8 h-8 text-text-muted mb-2" />
                        <p className="text-sm text-text-secondary">MP4 / WebM · max 40MB</p>
                      </div>
                    )}
                  </div>
                  <input ref={videoInputRef} type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => handleVideo(e.target.files?.[0])} />
                </div>
                <div>
                  <Badge color="violet" className="mb-3">Step 2 · Model face</Badge>
                  <div
                    onClick={() => faceInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragFace(true) }}
                    onDragLeave={() => setDragFace(false)}
                    onDrop={async (e) => {
                      e.preventDefault()
                      setDragFace(false)
                      await handleFace(e.dataTransfer.files?.[0])
                    }}
                    className={[
                      'border-2 border-dashed rounded-[18px] p-4 cursor-pointer min-h-[140px] transition-all duration-300',
                      dragFace ? 'border-accent bg-accent/10' : 'border-border-subtle bg-bg-base/30 hover:border-accent/40',
                    ].join(' ')}
                  >
                    {facePreview ? (
                      <img src={facePreview} alt="Model" className="w-full rounded-input object-contain max-h-40" />
                    ) : (
                      <div className="flex flex-col items-center py-4 text-center">
                        <User className="w-6 h-6 text-text-muted mb-2" />
                        <p className="text-xs text-text-secondary">Clear front-facing portrait</p>
                      </div>
                    )}
                  </div>
                  <input ref={faceInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFace(e.target.files?.[0])} />
                </div>
                <Input
                  label="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  rows={2}
                  placeholder="e.g. preserve hair color, match skin tone…"
                />
                <div className="flex items-center gap-2 text-[11px] text-text-muted">
                  <Badge color={kaggleSet ? 'success' : 'warning'}>{kaggleSet ? 'Kaggle tunnel set' : 'Kaggle required'}</Badge>
                </div>
                {error && <FriendlyError error={error} />}
                <MagneticButton strength={reduce ? 0 : 4} className="w-full">
                  <Button
                    onClick={handleGenerate}
                    loading={loading}
                    fullWidth
                    size="lg"
                    icon={Sparkles}
                    className="!h-14"
                    disabled={!videoData || !facePreview}
                  >
                    {loading ? 'Swapping face…' : 'Swap face in video'}
                  </Button>
                </MagneticButton>
              </div>
            </Card>
          </div>

          <div className="xl:col-span-7 space-y-6">
            <Card className="min-h-[360px]">
              <h3 className="font-display text-lg font-semibold text-text-primary mb-6">Output</h3>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="load" className="space-y-4">
                    <div className="aspect-video max-h-[400px] mx-auto rounded-[20px] skeleton border border-border-subtle" />
                    <ProgressBar indeterminate />
                    <p className="text-sm text-text-secondary text-center">GPU face swap — may take several minutes</p>
                  </motion.div>
                ) : current?.video_url ? (
                  <motion.div key="out" variants={reduce ? undefined : revealVariants} initial={reduce ? false : 'hidden'} animate="visible">
                    <div className="relative rounded-[20px] overflow-hidden border border-border-subtle bg-bg-elevated">
                      <video
                        ref={resultRef}
                        src={current.video_url}
                        className="w-full aspect-video object-cover"
                        loop
                        muted
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
                        <Badge color="violet" className="!text-[10px]">{current.engine || 'face-swap'}</Badge>
                      </div>
                    </div>
                    <a href={current.video_url} download target="_blank" rel="noreferrer" className="inline-block mt-4">
                      <Button variant="ghost" size="sm" icon={Download}>Download clip</Button>
                    </a>
                  </motion.div>
                ) : (
                  <motion.div key="empty">
                    <EmptyState
                      icon={Clapperboard}
                      title="No clip yet"
                      description="Upload a trending reel + your model face. Requires Kaggle GPU tunnel in Settings."
                    />
                    {videoPreview && (
                      <div className="mt-6 rounded-[18px] border border-dashed border-border-subtle p-4 opacity-50">
                        <p className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Reference preview</p>
                        <video ref={videoRef} src={videoPreview} className="w-full max-h-40 rounded-input" muted playsInline controls />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>
        </div>
      </Section>
    </Root>
  )
}
