/**
 * ProgressBar — fill animates left-to-right with a violet gradient
 * + glowing right-edge pulse. Use `indeterminate` for an unknown
 * duration (animated sweep).
 */
export default function ProgressBar({ value = 0, max = 100, indeterminate = false, className = '' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={['relative h-1.5 rounded-pill bg-bg-elevated overflow-hidden', className].join(' ')}>
      {indeterminate ? (
        <div
          className="absolute inset-y-0 w-1/3 bg-violet rounded-pill animate-shimmer-bg"
          style={{ backgroundSize: '200% 100%', background: 'linear-gradient(90deg, transparent, #7C3AED, transparent)' }}
        />
      ) : (
        <div
          className="h-full bg-violet rounded-pill transition-[width] duration-500 ease-spring animate-progress-pulse"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}
