import { Check, X } from 'lucide-react'
import { passwordChecklist } from '../../utils/authValidation'

/**
 * Live password requirement checklist for registration.
 */
export default function PasswordStrength({ password, className = '' }) {
  const items = passwordChecklist(password)
  const metCount = items.filter((i) => i.met).length
  const allMet = metCount === items.length

  return (
    <div
      className={[
        'rounded-input border border-border-subtle bg-bg-elevated/60 px-3.5 py-3',
        className,
      ].join(' ')}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="text-[10px] uppercase tracking-widest text-text-muted">Password strength</p>
        <span
          className={[
            'text-[10px] font-medium tabular-nums',
            allMet ? 'text-status-success' : 'text-text-muted',
          ].join(' ')}
        >
          {metCount}/{items.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[11px] leading-snug">
            {item.met ? (
              <Check className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <X className="w-3.5 h-3.5 text-text-disabled shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <span className={item.met ? 'text-text-secondary' : 'text-text-muted'}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
