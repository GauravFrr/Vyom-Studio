import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ScanFace, Upload, Sparkles, Download, Copy, ArrowLeft, Image as ImageIcon, User,
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
import useMotionPreference from '../../hooks/useMotionPreference'
import { pageStagger, fadeUp, revealVariants, readImageFile } from './instaMotion'

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return <motion.section variants={fadeUp} className={className}>{children}</motion.section>
}

function ImageSlot({ label, sub, preview, dragOver, onPick, onDrop, onDrag, icon: Icon, accent }) {
  return (
    <div
      onClick={onPick}
      onDragOver={(e) => { e.preventDefault(); onDrag(true) }}
      onDragLeave={() => onDrag(false)}
      onDrop={onDrop}
      className={[
        'border-2 border-dashed rounded-[18px] p-4 cursor-pointer min-h-[200px] transition-all duration-300',
        dragOver ? 'border-accent bg-accent/10' : 'border-border-subtle bg-bg-base/30 hover:border-accent/40',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}22` }}
        >
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{label}</p>
          <p className="text-[10px] text-text-muted">{sub}</p>
        </div>
      </div>
      {preview ? (
        <img src={preview} alt={label} className="w-full rounded-input object-contain max-h-48" />
      ) : (
        <div className="flex flex-col items-center py-6 text-center">
          <Upload className="w-6 h-6 text-text-muted mb-2" />
          <p className="text-xs text-text-secondary">Drop or click</p>
        </div>
      )}
    </div>
  )
}

export default function InstaFaceImage() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [scenePreview, setScenePreview] = useState(null)
  const [facePreview, setFacePreview] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [dragScene, setDragScene] = useState(false)
  const [dragFace, setDragFace] = useState(false)
  const sceneRef = useRef(null)
  const faceRef = useRef(null)

  const handleGenerate = async () => {
    if (!scenePreview) {
      toast({ kind: 'violet', title: 'Scene required', message: 'Upload image 1 — the scene / pose reference.' })
      return
    }
    if (!facePreview) {
      toast({ kind: 'violet', title: 'Face required', message: 'Upload image 2 — your model face.' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await pvtApi.faceCopyImage({
        scene_base64: scenePreview,
        face_base64: facePreview,
        notes: notes.trim() || undefined,
      })
      if (res.data?.success) {
        const item = { ...res.data, createdAt: new Date() }
        setCurrent(item)
        setHistory((h) => [item, ...h].slice(0, 8))
        toast({ kind: 'success', title: 'Face copied', message: 'Your model face is on the scene.' })
      } else {
        setError(res.data?.message || res.data?.detail || 'Face copy failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Face copy failed.')
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
          <ScanFace className="w-3 h-3" />
          Face copy · image
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Your face, <span className="text-gradient-violet">their scene</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Image 1 = pose, outfit & background. Image 2 = your AI model face. Output keeps the scene — only the face becomes yours.
        </p>
      </Section>

      <Section reduce={reduce}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-28">
            <Card className="relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-[0.1] pointer-events-none bg-violet-600" />
              <div className="relative space-y-5">
                <div>
                  <Badge color="muted" className="mb-3">Step 1</Badge>
                  <ImageSlot
                    label="Scene reference"
                    sub="Pose, outfit, background — image 1"
                    preview={scenePreview}
                    dragOver={dragScene}
                    icon={ImageIcon}
                    accent="#7C3AED"
                    onPick={() => sceneRef.current?.click()}
                    onDrag={setDragScene}
                    onDrop={async (e) => {
                      e.preventDefault()
                      setDragScene(false)
                      const data = await readImageFile(e.dataTransfer.files?.[0], toast)
                      if (data) setScenePreview(data)
                    }}
                  />
                  <input ref={sceneRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const data = await readImageFile(e.target.files?.[0], toast)
                    if (data) setScenePreview(data)
                  }} />
                </div>
                <div>
                  <Badge color="violet" className="mb-3">Step 2</Badge>
                  <ImageSlot
                    label="Model face"
                    sub="Your influencer identity — image 2"
                    preview={facePreview}
                    dragOver={dragFace}
                    icon={User}
                    accent="#EC4899"
                    onPick={() => faceRef.current?.click()}
                    onDrag={setDragFace}
                    onDrop={async (e) => {
                      e.preventDefault()
                      setDragFace(false)
                      const data = await readImageFile(e.dataTransfer.files?.[0], toast)
                      if (data) setFacePreview(data)
                    }}
                  />
                  <input ref={faceRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const data = await readImageFile(e.target.files?.[0], toast)
                    if (data) setFacePreview(data)
                  }} />
                </div>
                <Input
                  label="Extra notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  rows={2}
                  placeholder="e.g. keep earrings, softer skin, match lighting…"
                />
                {error && <FriendlyError error={error} />}
                <MagneticButton strength={reduce ? 0 : 4} className="w-full">
                  <Button
                    onClick={handleGenerate}
                    loading={loading}
                    fullWidth
                    size="lg"
                    icon={Sparkles}
                    className="!h-14"
                    disabled={!scenePreview || !facePreview}
                  >
                    {loading ? 'Blending face…' : 'Copy face to scene'}
                  </Button>
                </MagneticButton>
                <p className="text-[10px] text-text-muted text-center">
                  Uses Kaggle GPU if tunnel is on, else Durex AI dual-image / prompt fallback
                </p>
              </div>
            </Card>
          </div>

          <div className="xl:col-span-7">
            <Card className="min-h-[360px]">
              <h3 className="font-display text-lg font-semibold text-text-primary mb-6">Preview</h3>
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="load" className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {scenePreview && <img src={scenePreview} alt="" className="rounded-[14px] border border-border-subtle opacity-60" />}
                      {facePreview && <img src={facePreview} alt="" className="rounded-[14px] border border-border-subtle opacity-60" />}
                    </div>
                    <div className="aspect-[4/5] max-h-[480px] mx-auto rounded-[20px] skeleton border border-border-subtle" />
                    <ProgressBar indeterminate />
                  </motion.div>
                ) : current?.image_url ? (
                  <motion.div key="out" variants={reduce ? undefined : revealVariants} initial={reduce ? false : 'hidden'} animate="visible">
                    <img src={current.image_url} alt="Result" className="w-full rounded-[20px] object-contain max-h-[70vh] border border-border-subtle shadow-glow-violet-soft" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge color="violet">{current.engine || 'face-swap'}</Badge>
                      <a href={current.image_url} download target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" icon={Download}>Download</Button>
                      </a>
                      <Button variant="ghost" size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(current.image_url)}>Copy URL</Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="empty">
                    <EmptyState
                      icon={ScanFace}
                      title="No blend yet"
                      description="Upload scene + model face, then generate. Perfect for consistent AI influencer posts."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
            {history.length > 1 && (
              <Card className="mt-6">
                <p className="text-[10px] text-text-muted uppercase tracking-widest mb-3">History</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {history.slice(1).map((h, i) => (
                    <button key={i} type="button" onClick={() => setCurrent(h)} className="rounded-input overflow-hidden border border-border-subtle hover:border-accent/50">
                      <img src={h.image_url} alt="" className="w-full aspect-square object-cover" />
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
