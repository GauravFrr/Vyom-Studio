import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * CustomSelect — branded, smooth-animated dropdown.
 * Replaces native <select> so the panel picks up the design-system
 * glass / violet / hover treatment, and the open/close animates
 * instead of flashing the OS menu.
 *
 * Props:
 *   value       current value (controlled)
 *   onChange    (value) => void
 *   options     [{ value, label, sub? }]
 *   placeholder optional shown when value is empty
 *   className   extra classes for the trigger
 *   align       "left" | "right" — which side the menu opens (default "right")
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  className = '',
  align = 'right',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center justify-between gap-2 min-w-[140px] h-9 px-3',
          'bg-bg-elevated border border-border rounded-input',
          'text-sm text-text-primary',
          'transition-colors duration-200 hover:border-accent/40',
          'focus:outline-none focus:border-accent',
          className,
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current ? current.label : placeholder}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex flex-shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={[
              'absolute z-50 mt-1.5 min-w-full',
              'glass border border-border rounded-input',
              'py-1 max-h-64 overflow-y-auto',
              align === 'right' ? 'right-0' : 'left-0',
              'shadow-glow-violet-soft',
            ].join(' ')}
            role="listbox"
          >
            {options.map((opt) => {
              const selected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={[
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                    'transition-colors duration-150',
                    selected
                      ? 'text-accent-glow bg-accent/15'
                      : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
                  ].join(' ')}
                  role="option"
                  aria-selected={selected}
                >
                  <span className="truncate">{opt.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
