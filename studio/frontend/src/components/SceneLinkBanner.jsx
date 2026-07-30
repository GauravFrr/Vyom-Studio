import { Clapperboard, X } from 'lucide-react'

export default function SceneLinkBanner({ sceneNumber, label, onClear }) {
  return (
    <div className="mb-5 px-4 py-3 rounded-[14px] border border-accent/30 bg-accent/8 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <Clapperboard className="w-4 h-4 text-accent-glow" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          Linked to scene {sceneNumber}
        </p>
        {label && (
          <p className="text-xs text-text-muted mt-0.5 truncate">{label}</p>
        )}
        <p className="text-[11px] text-text-secondary mt-1">
          Generated assets attach to this scene on the storyboard automatically.
        </p>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors shrink-0"
          title="Unlink scene"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
