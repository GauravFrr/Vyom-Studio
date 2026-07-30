import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Wand2, Copy, Sparkles, RotateCcw, Clapperboard, Image as ImageIcon,
  Film, ChevronDown, ChevronUp, History, Check,
} from 'lucide-react'
import { storyApi, notifyProviderFallback } from '../api/client'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import FriendlyError from '../components/ui/FriendlyError'
import MagneticButton from '../components/MagneticButton'
import CustomSelect from '../components/ui/CustomSelect'
import EngineToggle from '../components/ui/EngineToggle'
import { useToast } from '../components/ui/Toast'
import useSettingsStore from '../store/settingsStore'
import useProjectStore from '../store/projectStore'
import useMotionPreference from '../hooks/useMotionPreference'
import { DEFAULT_SCENE_PROMPT_MASTER } from '../constants/scenePromptMasterDefault'
import { SMOOTH_EASE } from '../hooks/useHomeIntro'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: SMOOTH_EASE } },
}

function Section({ reduce, className = '', children }) {
  if (reduce) return <section className={className}>{children}</section>
  return <motion.section variants={fadeUp} className={className}>{children}</motion.section>
}

function copyText(text, label, toast) {
  if (!text?.trim()) return
  navigator.clipboard?.writeText(text)
  toast({ kind: 'success', title: 'Copied', message: `${label} copied to clipboard.` })
}

export default function ScenePromptStudio() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const scenes = useProjectStore((s) => s.scenes)
  const updateScene = useProjectStore((s) => s.updateScene)
  const persistCurrentProject = useProjectStore((s) => s.persistCurrentProject)
  const currentProject = useProjectStore((s) => s.currentProject)

  const masterFromStore = useSettingsStore((s) => s.scenePromptMasterPrompt)
  const setMasterInStore = useSettingsStore((s) => s.setScenePromptMasterPrompt)
  const scenePromptProvider = useSettingsStore((s) => s.scenePromptProvider || 'gemini')
  const setScenePromptProvider = useSettingsStore((s) => s.setScenePromptProvider)
  const scenePromptGeminiModel = useSettingsStore((s) => s.scenePromptGeminiModel || 'gemini-2.5-flash-lite')
  const setScenePromptGeminiModel = useSettingsStore((s) => s.setScenePromptGeminiModel)
  const scenePromptOpenaiModel = useSettingsStore((s) => s.scenePromptOpenaiModel || 'gpt-4o-mini')
  const setScenePromptOpenaiModel = useSettingsStore((s) => s.setScenePromptOpenaiModel)
  const scenePromptModel = useSettingsStore((s) => s.scenePromptModel || 'gpt-5.4')
  const setScenePromptModel = useSettingsStore((s) => s.setScenePromptModel)
  const hasGoogleKey = Boolean(useSettingsStore((s) => s.googleApiKey?.trim()))
  const hasOpenaiKey = Boolean(useSettingsStore((s) => s.openaiApiKey?.trim()))
  const hasTokenlbKey = Boolean(useSettingsStore((s) => s.tokenlbApiKey?.trim()))

  const GEMINI_MODELS = [
    { value: 'gemini-2.5-flash-lite', label: '2.5 Flash Lite' },
    { value: 'gemini-2.5-flash', label: '2.5 Flash' },
    { value: 'gemini-3-flash-preview', label: '3 Flash' },
    { value: 'gemini-2.0-flash', label: '2.0 Flash' },
  ]
  const OPENAI_MODELS = [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ]
  const TOKENLB_GPT_MODELS = [
    { value: 'gpt-5.4', label: 'GPT 5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT 5.4 Mini' },
    { value: 'gpt-5.5', label: 'GPT 5.5' },
  ]
  const PROVIDERS = [
    { value: 'gemini', label: 'Gemini' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'tokenlb', label: 'TokenLB' },
  ]

  const [masterPrompt, setMasterPrompt] = useState('')
  const [sceneText, setSceneText] = useState('')
  const [masterOpen, setMasterOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [attachSceneId, setAttachSceneId] = useState('')

  useEffect(() => {
    const stored = masterFromStore?.trim()
    setMasterPrompt(stored || DEFAULT_SCENE_PROMPT_MASTER)
  }, [masterFromStore])

  const saveMasterPrompt = () => {
    setMasterInStore(masterPrompt)
    toast({ kind: 'success', title: 'Master prompt saved', message: 'Used for every scene on this page and Storyboard batch.' })
  }

  const resetMasterPrompt = () => {
    setMasterPrompt(DEFAULT_SCENE_PROMPT_MASTER)
    setMasterInStore(DEFAULT_SCENE_PROMPT_MASTER)
    toast({ kind: 'info', title: 'Reset', message: 'Dada Ji universal master prompt restored.' })
  }

  const handleGenerate = async () => {
    if (!masterPrompt.trim()) {
      toast({ kind: 'violet', title: 'Master prompt required', message: 'Paste your universal master prompt first.' })
      return
    }
    if (!sceneText.trim()) {
      toast({ kind: 'violet', title: 'Scene required', message: 'Enter one scene line (Hindi or English).' })
      return
    }
    if (scenePromptProvider === 'gemini' && !hasGoogleKey) {
      toast({ kind: 'violet', title: 'Google key missing', message: 'Settings → API Keys → Google (Gemini).' })
      return
    }
    if (scenePromptProvider === 'openai' && !hasOpenaiKey) {
      toast({ kind: 'violet', title: 'OpenAI key missing', message: 'Settings → API Keys → OpenAI (ChatGPT).' })
      return
    }
    if (scenePromptProvider === 'tokenlb' && !hasTokenlbKey) {
      toast({ kind: 'violet', title: 'TokenLB key missing', message: 'Settings → API Keys → TokenLB.' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await storyApi.scenePromptStudio({
        master_prompt: masterPrompt,
        scene_text: sceneText.trim(),
      })
      notifyProviderFallback(res)
      const data = res.data
      if (!data?.image_prompt) throw new Error('No image prompt in response')
      const item = {
        scene_input: sceneText.trim(),
        scene_summary: data.scene_summary || '',
        image_prompt: data.image_prompt,
        motion_prompt: data.motion_prompt || '',
        createdAt: new Date().toISOString(),
      }
      setResult(item)
      setHistory((h) => [item, ...h].slice(0, 30))
      setSceneText('')
      toast({ kind: 'success', title: 'Prompts ready', message: 'Image + animation prompts generated.' })
    } catch (e) {
      const msg = e?.response?.data?.detail
        ? String(e.response.data.detail)
        : 'Could not generate prompts. Check API keys in Settings.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleAttachToStoryboard = async () => {
    if (!result || !attachSceneId) {
      toast({ kind: 'violet', title: 'Pick a scene', message: 'Select which storyboard scene to attach prompts to.' })
      return
    }
    updateScene(attachSceneId, {
      image_prompt: result.image_prompt,
      motion_prompt: result.motion_prompt,
      status: 'prompts_ready',
    })
    if (currentProject?.id) await persistCurrentProject()
    toast({
      kind: 'success',
      title: 'Attached to storyboard',
      message: 'Scene updated — you can generate image from Storyboard.',
    })
  }

  const sceneOptions = [
    { value: '', label: 'Attach to storyboard scene…' },
    ...scenes.map((s) => ({
      value: s.id,
      label: `Scene ${s.scene_number ?? '?'} — ${(s.brief_description || 'Untitled').slice(0, 48)}`,
    })),
  ]

  const Root = reduce ? 'div' : motion.div
  const rootProps = reduce
    ? { className: 'space-y-10 lg:space-y-12 pb-6' }
    : {
        className: 'space-y-10 lg:space-y-12 pb-6',
        initial: 'hidden',
        animate: 'visible',
        variants: { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } },
      }

  return (
    <Root {...rootProps}>
      <Section reduce={reduce}>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-5">
          <Wand2 className="w-3 h-3 text-accent-glow" />
          Master prompt workflow
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Scene <span className="text-gradient-violet">Prompt Studio</span>
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed mb-4">
          Same flow as ChatGPT: paste your universal master prompt once, then send scenes one by one.
          AI returns a detailed image prompt + short animation prompt for Veo / ByteDance.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            color={
              scenePromptProvider === 'gemini'
                ? (hasGoogleKey ? 'success' : 'muted')
                : scenePromptProvider === 'openai'
                  ? (hasOpenaiKey ? 'success' : 'muted')
                  : (hasTokenlbKey ? 'success' : 'muted')
            }
          >
            {scenePromptProvider === 'gemini'
              ? (hasGoogleKey ? 'Google key set' : 'Add Google key in Settings')
              : scenePromptProvider === 'openai'
                ? (hasOpenaiKey ? 'OpenAI key set' : 'Add OpenAI key in Settings')
                : (hasTokenlbKey ? 'TokenLB key set' : 'Add TokenLB key in Settings')}
          </Badge>
          <Badge color="violet">
            {scenePromptProvider === 'gemini'
              ? scenePromptGeminiModel
              : scenePromptProvider === 'openai'
                ? scenePromptOpenaiModel
                : scenePromptModel}
          </Badge>
          <span className="text-xs text-text-muted">
            {scenePromptProvider === 'gemini'
              ? 'Google Gemini API'
              : scenePromptProvider === 'openai'
                ? 'api.openai.com'
                : 'tokenlb.net'}
          </span>
        </div>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
        <Section reduce={reduce}>
          <Card className="h-full">
            <button
              type="button"
              onClick={() => setMasterOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 mb-4 text-left"
            >
              <div>
                <h3 className="font-display text-lg font-semibold text-text-primary">Universal master prompt</h3>
                <p className="text-xs text-text-muted mt-0.5">System instructions — character, style, output format</p>
              </div>
              {masterOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
            </button>

            {masterOpen && (
              <>
                <Input
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  multiline
                  rows={16}
                  inputClassName="min-h-[320px] font-mono text-xs leading-relaxed"
                  placeholder="Paste your UNIVERSAL MASTER PROMPT…"
                />
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button size="sm" icon={Check} onClick={saveMasterPrompt}>Save master prompt</Button>
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetMasterPrompt}>Reset to Dada Ji default</Button>
                </div>
              </>
            )}
          </Card>
        </Section>

        <Section reduce={reduce}>
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-button bg-accent/15 flex items-center justify-center">
                <Clapperboard className="w-5 h-5 text-accent-glow" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-text-primary">Scene input</h3>
                <p className="text-xs text-text-muted">One scene line — Hindi or English</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Provider</p>
              <EngineToggle
                options={PROVIDERS}
                value={scenePromptProvider}
                onChange={setScenePromptProvider}
              />
            </div>
            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Model</p>
              <EngineToggle
                options={
                  scenePromptProvider === 'gemini'
                    ? GEMINI_MODELS
                    : scenePromptProvider === 'openai'
                      ? OPENAI_MODELS
                      : TOKENLB_GPT_MODELS
                }
                value={
                  scenePromptProvider === 'gemini'
                    ? scenePromptGeminiModel
                    : scenePromptProvider === 'openai'
                      ? scenePromptOpenaiModel
                      : scenePromptModel
                }
                onChange={
                  scenePromptProvider === 'gemini'
                    ? setScenePromptGeminiModel
                    : scenePromptProvider === 'openai'
                      ? setScenePromptOpenaiModel
                      : setScenePromptModel
                }
              />
            </div>

            <Input
              label="Your scene"
              value={sceneText}
              onChange={(e) => setSceneText(e.target.value)}
              multiline
              rows={4}
              placeholder="तभी उन्हें ज़मीन पर एक पुरानी घड़ी मिली।"
              inputClassName="min-h-[100px]"
            />

            <div className="mt-5">
              <MagneticButton strength={reduce ? 0 : 4}>
                <Button
                  fullWidth
                  size="lg"
                  icon={Sparkles}
                  loading={loading}
                  onClick={handleGenerate}
                  className="shadow-glow-violet-soft"
                >
                  {loading ? 'Generating prompts…' : 'Generate image + animation prompts'}
                </Button>
              </MagneticButton>
            </div>

            {error && (
              <div className="mt-4">
                <FriendlyError message={error} />
              </div>
            )}
          </Card>
        </Section>
      </div>

      <Section reduce={reduce}>
        {result ? (
          <Card className="relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <Badge color="violet">Latest output</Badge>
              {scenes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <CustomSelect
                    value={attachSceneId}
                    onChange={setAttachSceneId}
                    options={sceneOptions}
                    className="min-w-[220px]"
                  />
                  <Button size="sm" variant="secondary" icon={Clapperboard} onClick={handleAttachToStoryboard}>
                    Attach to storyboard
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <OutputBlock
                label="Scene"
                text={result.scene_summary || result.scene_input}
                onCopy={() => copyText(result.scene_summary || result.scene_input, 'Scene', toast)}
              />
              <OutputBlock
                label="Image Prompt"
                icon={ImageIcon}
                text={result.image_prompt}
                onCopy={() => copyText(result.image_prompt, 'Image prompt', toast)}
              />
              <OutputBlock
                label="Animation Prompt"
                icon={Film}
                text={result.motion_prompt}
                onCopy={() => copyText(result.motion_prompt, 'Animation prompt', toast)}
                mono
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-border-subtle">
              <Button as={Link} to="/image-generator" variant="secondary" size="sm" icon={ImageIcon}>
                Open Image Generator
              </Button>
              <Button as={Link} to="/storyboard" variant="ghost" size="sm" icon={Clapperboard}>
                Storyboard
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={Wand2}
              title="Waiting for your first scene"
              description="Save your master prompt, paste one scene line, and hit Generate. Output matches your ChatGPT format."
            />
          </Card>
        )}
      </Section>

      {history.length > 1 && (
        <Section reduce={reduce}>
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-text-muted" />
              <h3 className="font-display font-semibold text-text-primary">Recent ({history.length})</h3>
            </div>
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {history.slice(1).map((item, i) => (
                <button
                  key={`${item.createdAt}-${i}`}
                  type="button"
                  onClick={() => setResult(item)}
                  className="w-full text-left p-4 rounded-[16px] border border-border-subtle bg-bg-elevated/30 hover:border-accent/35 transition-colors"
                >
                  <p className="text-sm text-text-primary line-clamp-1 mb-1">{item.scene_input}</p>
                  <p className="text-xs text-text-muted line-clamp-2 font-mono">{item.image_prompt}</p>
                </button>
              ))}
            </div>
          </Card>
        </Section>
      )}
    </Root>
  )
}

function OutputBlock({ label, text, onCopy, icon: Icon, mono = false }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted hover:text-accent-glow transition-colors"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>
      <div
        className={[
          'p-4 rounded-[16px] bg-bg-elevated/50 border border-border-subtle text-sm leading-relaxed text-text-secondary whitespace-pre-wrap',
          mono ? 'font-mono text-xs' : '',
        ].join(' ')}
      >
        {text || '—'}
      </div>
    </div>
  )
}
