import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion'
import {
  Library, Sparkles, User, Image as ImageIcon, Box, Search,
  Plus, Tag, Copy, Download, Trash2, Star, Pin,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import MagneticButton from '../components/MagneticButton'
import { useToast } from '../components/ui/Toast'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE, gridItemVariants } from '../hooks/useHomeIntro'

const TYPES = [
  { value: 'character', label: 'Characters', icon: User },
  { value: 'background', label: 'Backgrounds', icon: ImageIcon },
  { value: 'prop', label: 'Props', icon: Box },
]

const SEED = [
  { id: 'a1', type: 'character', name: 'Old village elder', tags: ['mythological', 'sage'], pinned: true, swatch: 'linear-gradient(135deg, #7C3AED, #4F46E5)' },
  { id: 'a2', type: 'character', name: 'Curious 10-year-old', tags: ['horror', 'protagonist'], pinned: false, swatch: 'linear-gradient(135deg, #F59E0B, #EF4444)' },
  { id: 'a3', type: 'background', name: 'Misty pine forest', tags: ['fantasy', 'dawn'], pinned: true, swatch: 'linear-gradient(135deg, #0F0F1A, #1A1A2E)' },
  { id: 'a4', type: 'background', name: 'Old attic interior', tags: ['horror', 'noir'], pinned: false, swatch: 'linear-gradient(135deg, #1E1E35, #2A2A45)' },
  { id: 'a5', type: 'prop', name: 'Brass oil lamp', tags: ['mythological', 'magic'], pinned: true, swatch: 'linear-gradient(135deg, #FCD34D, #F59E0B)' },
  { id: 'a6', type: 'prop', name: 'Hand-painted mask', tags: ['thriller'], pinned: false, swatch: 'linear-gradient(135deg, #EF4444, #7C3AED)' },
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

const gridStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.52, ease: SMOOTH_EASE },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.28, ease: SMOOTH_EASE },
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
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-[18px] bg-bg-elevated/50 border border-border-subtle h-full">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold text-text-primary tabular-nums leading-none">{value}</p>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  )
  if (reduce) return <div>{inner}</div>
  return <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

export default function AssetLibrary() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [type, setType] = useState('character')
  const [query, setQuery] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [assets, setAssets] = useState(SEED)

  const counts = useMemo(() => {
    const out = { character: 0, background: 0, prop: 0, pinned: 0 }
    for (const a of assets) {
      out[a.type]++
      if (a.pinned) out.pinned++
    }
    return out
  }, [assets])

  const filtered = useMemo(() => {
    let list = assets.filter((a) => a.type === type)
    if (pinnedOnly) list = list.filter((a) => a.pinned)
    if (!query) return list
    const q = query.toLowerCase()
    return list.filter(
      (a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [assets, type, query, pinnedOnly])

  const togglePin = (id) => {
    setAssets((arr) => arr.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)))
    toast({ kind: 'violet', title: 'Pin updated' })
  }

  const handleDelete = (id) => {
    if (!confirm('Delete this asset?')) return
    setAssets((arr) => arr.filter((a) => a.id !== id))
    toast({ kind: 'info', title: 'Asset deleted' })
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
          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-accent-secondary" />
          Reusable library
        </div>
        <h2 className="font-display font-bold text-3xl md:text-4xl leading-tight tracking-tight mb-3">
          Your <span className="text-gradient-violet">asset</span> vault
        </h2>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          Characters, backgrounds, and props — pin favorites for storyboards, image gen, and your AI influencer workflow.
        </p>
      </Section>

      {/* Stats */}
      <Section reduce={reduce}>
        <motion.div
          variants={reduce ? undefined : gridStagger}
          initial={reduce ? false : 'hidden'}
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4"
        >
          <StatPill icon={User} label="Characters" value={counts.character} accent="#7C3AED" reduce={reduce} />
          <StatPill icon={ImageIcon} label="Backgrounds" value={counts.background} accent="#3B82F6" reduce={reduce} />
          <StatPill icon={Box} label="Props" value={counts.prop} accent="#06B6D4" reduce={reduce} />
          <StatPill icon={Star} label="Pinned" value={counts.pinned} accent="#F59E0B" reduce={reduce} />
        </motion.div>
      </Section>

      {/* Controls + grid */}
      <Section reduce={reduce}>
        <Card className="relative overflow-hidden mb-6">
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-[0.1] pointer-events-none"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #F59E0B)' }}
          />
          <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-button bg-accent/15 flex items-center justify-center">
                <Library className="w-5 h-5 text-accent-glow" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-text-primary">Browse assets</h3>
                <p className="text-xs text-text-muted mt-0.5">{assets.length} total · search by name or tag</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 xl:max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search assets…"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-bg-elevated/80 border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:shadow-glow-violet-soft transition-all"
                />
              </div>
              <MagneticButton strength={reduce ? 0 : 4}>
                <Button as={Link} to="/image-generator" icon={Plus} size="sm" className="whitespace-nowrap">
                  New asset
                </Button>
              </MagneticButton>
            </div>
          </div>

          <div className="relative mt-6 pt-6 border-t border-border-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <LayoutGroup>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon
                  const active = type === t.value
                  const count = counts[t.value] || 0
                  return (
                    <motion.button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
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
                          layoutId="asset-type-pill"
                          className="absolute inset-0 rounded-pill bg-accent/12 border border-accent/35"
                          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                        />
                      )}
                      <Icon className="relative z-10 w-3.5 h-3.5" />
                      <span className="relative z-10">{t.label}</span>
                      <span className="relative z-10 text-[10px] font-mono text-text-muted">({count})</span>
                    </motion.button>
                  )
                })}
              </div>
            </LayoutGroup>

            <button
              type="button"
              onClick={() => setPinnedOnly((v) => !v)}
              className={[
                'inline-flex items-center gap-2 px-3.5 h-10 rounded-pill border text-sm font-medium transition-colors',
                pinnedOnly
                  ? 'border-accent-secondary/50 bg-accent-secondary/10 text-accent-secondary-glow'
                  : 'border-border-subtle text-text-secondary hover:border-accent-secondary/30 hover:text-text-primary',
              ].join(' ')}
            >
              <Pin className="w-3.5 h-3.5" />
              Pinned only
            </button>
          </div>
        </Card>

        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.45, ease: SMOOTH_EASE }}
            >
              <Card>
                <EmptyState
                  icon={Library}
                  title="No assets in this view"
                  description="Pin your best generations to reuse them across projects and keep characters consistent."
                  action={
                    <Button as={Link} to="/image-generator" icon={Sparkles} size="lg">
                      Generate an asset
                    </Button>
                  }
                />
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={`grid-${type}-${pinnedOnly}-${query}`}
              variants={reduce ? undefined : gridStagger}
              initial={reduce ? false : 'hidden'}
              animate="visible"
              exit={reduce ? undefined : { opacity: 0 }}
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    reduce={reduce}
                    onPin={() => togglePin(a.id)}
                    onDelete={() => handleDelete(a.id)}
                    onCopy={() => toast({ kind: 'success', title: 'Copied to clipboard' })}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>
    </Root>
  )
}

function AssetCard({ asset: a, reduce, onPin, onDelete, onCopy }) {
  const inner = (
    <article className="group h-full rounded-[22px] border border-border-subtle bg-bg-elevated/40 overflow-hidden hover:border-accent/35 hover:shadow-glow-violet-soft transition-all duration-300">
      <div className="aspect-square relative overflow-hidden" style={{ background: a.swatch }}>
        {a.image_url && (
          <img
            src={a.image_url}
            alt={a.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {a.pinned && (
          <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-accent-secondary/90 flex items-center justify-center shadow-glow-gold">
            <Star className="w-4 h-4 text-bg-base fill-bg-base" />
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ActionBtn icon={Star} title={a.pinned ? 'Unpin' : 'Pin'} onClick={onPin} active={a.pinned} />
          <ActionBtn icon={Copy} title="Copy" onClick={onCopy} />
          <ActionBtn icon={Download} title="Download" onClick={() => {}} />
          <ActionBtn icon={Trash2} title="Delete" onClick={onDelete} danger />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-display text-sm font-semibold text-text-primary truncate">{a.name}</h3>
          <Badge color="muted" className="!text-[9px] flex-shrink-0">{a.type}</Badge>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {a.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-bg-base/50 border border-border-subtle text-[9px] uppercase tracking-wider text-text-muted"
            >
              <Tag className="w-2.5 h-2.5" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </article>
  )

  if (reduce) return <div>{inner}</div>
  return (
    <motion.div layout variants={cardVariants} exit="exit">
      {inner}
    </motion.div>
  )
}

function ActionBtn({ icon: Icon, title, onClick, active, danger }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
      title={title}
      className={[
        'w-8 h-8 rounded-full backdrop-blur flex items-center justify-center text-white transition-colors',
        danger ? 'bg-black/60 hover:bg-status-error' : 'bg-black/60 hover:bg-black/80',
      ].join(' ')}
    >
      <Icon className={['w-3.5 h-3.5', active ? 'fill-accent-secondary-glow text-accent-secondary-glow' : ''].join(' ')} />
    </button>
  )
}
