import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HardDrive, Image as ImageIcon, Video, Mic, Search, RefreshCw, Film,
  FolderOpen, Download, Copy, Trash2, Play, ExternalLink,
} from 'lucide-react'
import { resolveMediaUrl, storageApi, extractApiError } from '../api/client'
import { SecureImage, SecureVideo, SecureAudio } from '../components/SecureMedia'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import useMotionPreference from '../hooks/useMotionPreference'
import { gridItemVariants } from '../hooks/useHomeIntro'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'orphan', label: 'Unlinked' },
]

function formatBytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatTile({ icon: Icon, label, value, accent, reduce }) {
  const inner = (
    <Card className="h-full">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-button flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${accent}, rgba(124,58,237,0.3))` }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest">{label}</div>
        </div>
      </div>
    </Card>
  )
  return reduce ? inner : <motion.div variants={gridItemVariants}>{inner}</motion.div>
}

export default function MediaLibrary() {
  const reduce = useMotionPreference()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchMedia = useCallback(async () => {
    setLoading(true)
    try {
      const res = await storageApi.listGenerated()
      setItems(res.data?.items || [])
      setStats(res.data?.stats || null)
    } catch (err) {
      setItems([])
      toast({ kind: 'error', title: 'Could not load media', message: extractApiError(err, 'Check your connection and try again.') })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  const filtered = useMemo(() => {
    let list = [...items]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((it) =>
        it.filename?.toLowerCase().includes(q)
        || it.engine_label?.toLowerCase().includes(q)
        || it.linked_project_name?.toLowerCase().includes(q),
      )
    }
    if (filter === 'orphan') list = list.filter((it) => it.orphan)
    else if (filter !== 'all') list = list.filter((it) => it.kind === filter)
    return list
  }, [items, search, filter])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await storageApi.deleteAsset(deleteTarget.id)
      setItems((prev) => prev.filter((it) => it.id !== deleteTarget.id))
      if (preview?.id === deleteTarget.id) setPreview(null)
      setDeleteTarget(null)
      toast({ kind: 'success', title: 'File deleted' })
      fetchMedia()
    } catch {
      toast({ kind: 'error', title: 'Delete failed' })
    } finally {
      setDeleting(false)
    }
  }

  const copyUrl = (url) => {
    const full = resolveMediaUrl(url)
    navigator.clipboard?.writeText(full).then(
      () => toast({ kind: 'success', title: 'URL copied' }),
      () => toast({ kind: 'info', title: full }),
    )
  }

  return (
    <div className="space-y-8 pb-6">
      <section>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-widest mb-4">
          <HardDrive className="w-3 h-3" />
          Local storage
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-2">
              Media <span className="text-gradient-violet">library</span>
            </h2>
            <p className="text-text-secondary max-w-xl leading-relaxed">
              Your private images, clips, voiceovers, and exports — only visible to your account.
            </p>
          </div>
          <Button variant="ghost" icon={RefreshCw} loading={loading} onClick={fetchMedia}>
            Refresh
          </Button>
        </div>
      </section>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile icon={ImageIcon} label="Images" value={stats.images} accent="#3B82F6" reduce={reduce} />
          <StatTile icon={Video} label="Videos" value={stats.videos} accent="#7C3AED" reduce={reduce} />
          <StatTile icon={Mic} label="Audio" value={stats.audio} accent="#06B6D4" reduce={reduce} />
          <StatTile icon={FolderOpen} label="Unlinked" value={stats.orphans} accent="#F59E0B" reduce={reduce} />
          <StatTile icon={HardDrive} label="Disk used" value={formatBytes(stats.total_bytes)} accent="#64748B" reduce={reduce} />
        </div>
      )}

      <Card>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename, engine, project…"
              className="w-full h-11 pl-10 pr-4 rounded-button bg-bg-base border border-border-subtle text-sm focus:outline-none focus:border-accent/50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={[
                  'h-9 px-3 rounded-button border text-xs font-medium transition-colors',
                  filter === f.value ? 'border-accent/50 bg-accent/10 text-text-primary' : 'border-border-subtle text-text-secondary',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-muted mt-3">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</p>
      </Card>

      {loading ? (
        <p className="text-center text-text-muted py-16">Scanning storage…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No media files"
          description="Generate images or videos from Image / Video Generator — they appear here automatically."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onPreview={() => setPreview(item)}
              onCopy={() => copyUrl(item.url)}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.filename || 'Preview'}
        width={preview?.kind === 'video' ? 420 : 520}
        footer={
          preview && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Download} onClick={() => {
                const a = document.createElement('a')
                a.href = resolveMediaUrl(preview.url)
                a.download = preview.filename
                a.click()
              }}>
                Download
              </Button>
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyUrl(preview.url)}>Copy URL</Button>
              {preview.linked_project_id && (
                <Button size="sm" variant="ghost" as={Link} to={`/projects`}>
                  In: {preview.linked_project_name}
                </Button>
              )}
            </div>
          )
        }
      >
        {preview && (
          <div className="space-y-4">
            {preview.kind === 'image' && (
              <SecureImage src={preview.url} alt="" className="w-full rounded-[14px] border border-border-subtle" />
            )}
            {preview.kind === 'video' && (
              <SecureVideo
                src={preview.url}
                controls
                playsInline
                className="w-full max-h-[70vh] rounded-[14px] bg-black border border-border-subtle"
              />
            )}
            {preview.kind === 'audio' && (
              <SecureAudio src={preview.url} controls className="w-full" />
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge color="violet">{preview.engine_label}</Badge>
              <Badge color="muted">{formatBytes(preview.size_bytes)}</Badge>
              {preview.orphan ? (
                <Badge color="warning">Not in any project</Badge>
              ) : (
                <Badge color="success">
                  Scene {preview.linked_scene_number} · {preview.linked_project_name}
                </Badge>
              )}
            </div>
            <p className="text-xs text-text-muted font-mono break-all">{preview.url}</p>
            <p className="text-xs text-text-muted">Saved {formatDate(preview.modified_at)}</p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete file?"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>Delete from disk</Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          Remove <strong className="text-text-primary">{deleteTarget?.filename}</strong> from your library?
          Projects that reference this file will show a broken preview until you regenerate.
        </p>
      </Modal>
    </div>
  )
}

function MediaCard({ item, onPreview, onCopy, onDelete }) {
  return (
    <Card interactive className="overflow-hidden group p-0">
      <button type="button" onClick={onPreview} className="w-full text-left">
        <div className="aspect-square relative bg-bg-base border-b border-border-subtle overflow-hidden">
          {item.kind === 'image' && (
            <SecureImage src={item.url} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
          )}
          {item.kind === 'video' && (
            <>
              <SecureVideo src={item.url} muted playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="w-8 h-8 text-white/90" />
              </div>
            </>
          )}
          {item.kind === 'audio' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-muted">
              <Mic className="w-8 h-8" />
              <span className="text-[10px] uppercase tracking-widest">Audio</span>
            </div>
          )}
          {item.orphan && (
            <span className="absolute top-2 left-2">
              <Badge color="warning">Unlinked</Badge>
            </span>
          )}
        </div>
        <div className="p-3 space-y-1">
          <p className="text-xs font-medium text-text-primary truncate">{item.filename}</p>
          <p className="text-[10px] text-text-muted">{item.engine_label} · {formatBytes(item.size_bytes)}</p>
        </div>
      </button>
      <div className="px-3 pb-3 flex gap-1">
        <button type="button" onClick={onCopy} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5" title="Copy URL">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onPreview} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5" title="Preview">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="p-2 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/10 ml-auto" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  )
}
