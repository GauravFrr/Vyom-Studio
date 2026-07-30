import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Lock, Upload, Image as ImageIcon, Sparkles, Download, Copy, Wand2, ArrowLeft } from 'lucide-react'
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
import { pageStagger, fadeUp, revealVariants, readImageFile, SMOOTH_EASE } from './instaMotion'

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return <motion.section variants={fadeUp} className={className}>{children}</motion.section>
}

export default function InstaPvtTransform() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [imagePreview, setImagePreview] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const proxySet = Boolean(useSettingsStore.getState().durexProxy?.trim())

  const handleFile = async (file) => {
    const data = await readImageFile(file, toast)
    if (data) setImagePreview(data)
  }

  const handleGenerate = async () => {
    if (!imagePreview) {
      toast({ kind: 'violet', title: 'Photo required', message: 'Upload a source image first.' })
      return
    }
    if (!prompt.trim()) {
      toast({ kind: 'violet', title: 'Prompt required', message: 'Describe the transformation you want.' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await pvtApi.transform({ prompt: prompt.trim(), image_base64: imagePreview })
      if (res.data?.success) {
        const item = { ...res.data, prompt, createdAt: new Date() }
        setCurrent(item)
        setHistory((h) => [item, ...h].slice(0, 8))
        toast({ kind: 'success', title: 'Done', message: 'Durex transform complete.' })
      } else {
        setError(res.data?.message || res.data?.detail || 'Transform failed.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail ? String(e.response.data.detail) : 'Transform failed.')
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
          Durex transform · photo
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Pvt <span className="text-gradient-violet">photo</span> edit
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Photo + prompt → exclusive Instagram-style image via Durex AI.
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
                  <h3 className="font-display text-xl font-semibold text-text-primary">Source photo</h3>
                  <p className="text-sm text-text-muted mt-0.5">PNG, JPG, WebP · up to 10MB</p>
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
                {imagePreview ? (
                  <img src={imagePreview} alt="Source" className="w-full rounded-input object-contain max-h-56" />
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <ImageIcon className="w-8 h-8 text-text-muted mb-2" />
                    <p className="text-sm text-text-secondary">Drop photo or click to browse</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
              </div>
              <div className="mt-5">
                <Input
                  label="Transform prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  multiline
                  rows={5}
                  placeholder="Describe the exclusive / private Instagram-style edit you want…"
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
                    {loading ? 'Transforming…' : 'Generate pvt content'}
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
                    <div className="aspect-[4/5] max-h-[520px] mx-auto rounded-[20px] skeleton border border-border-subtle" />
                    <ProgressBar indeterminate />
                    <p className="text-sm text-text-secondary text-center">Durex AI · ~30–60s</p>
                  </motion.div>
                ) : current?.image_url ? (
                  <motion.div key="out" variants={reduce ? undefined : revealVariants} initial={reduce ? false : 'hidden'} animate="visible" className="space-y-4">
                    <img src={current.image_url} alt="Result" className="w-full rounded-[20px] object-contain max-h-[70vh] border border-border-subtle shadow-glow-violet-soft" />
                    <div className="flex gap-2">
                      <a href={current.image_url} download target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" icon={Download}>Download</Button>
                      </a>
                      <Button variant="ghost" size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(current.image_url)}>Copy URL</Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="empty" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                    <EmptyState icon={ImageIcon} title="No output yet" description="Upload a photo, write a prompt, and hit Generate." />
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
