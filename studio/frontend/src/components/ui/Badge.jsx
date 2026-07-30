/**
 * Badge — small pill for status indicators. Color is one of the design
 * tokens (success / error / warning / info / violet / gold / muted).
 */
const colorMap = {
  success: 'bg-status-success/15 text-status-success border-status-success/50',
  error:   'bg-status-error/15 text-status-error border-status-error/50',
  warning: 'bg-status-warning/15 text-status-warning border-status-warning/50',
  info:    'bg-status-info/15 text-status-info border-status-info/50',
  // Use solid brand violet (not translucent) so the badge never reads as
  // a thin pale/white outline on the dark glass surface.
  violet:  'bg-[#7C3AED]/25 text-accent-glow border-[#7C3AED]',
  gold:    'bg-accent-secondary/25 text-accent-secondary-glow border-accent-secondary',
  muted:   'bg-bg-elevated text-text-secondary border-border',
}

export default function Badge({ children, color = 'muted', dot = false, className = '', pulse = false }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge border text-[10px] font-medium uppercase tracking-wider',
        colorMap[color] || colorMap.muted,
        className,
      ].join(' ')}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 animate-ping-slow" />
          )}
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}
