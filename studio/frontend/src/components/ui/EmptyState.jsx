/**
 * EmptyState — illustrated empty placeholders. Pass a `graphic` slot
 * (any React node) for the line-art graphic, or use the default.
 */
export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={['flex flex-col items-center justify-center text-center py-16 px-6', className].join(' ')}>
      <div className="relative mb-6">
        {/* Concentric rings — outer one is dashed, no spin animation
            (the spin is expensive on top of everything else; static
            looks just as good in the empty state) */}
        <div className="absolute inset-0 rounded-full border border-dashed border-accent/30" />
        <div className="absolute inset-3 rounded-full border border-accent/20" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-accent/20 to-bg-elevated flex items-center justify-center shadow-glow-violet-soft">
          {Icon && <Icon className="w-8 h-8 text-accent-glow" strokeWidth={1.5} />}
        </div>
      </div>
      <h3 className="text-lg font-display font-semibold text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-sm mb-6 leading-relaxed">{description}</p>
      )}
      {action}
    </div>
  )
}
