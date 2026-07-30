/**
 * Select — minimal dropdown with the design system's glass styling.
 * Use for storage path, language pickers, etc.
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export default function Select({ value, onChange, options, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = options.find((o) => o.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className={['relative', className].join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full h-10 px-3 rounded-input bg-bg-elevated border text-sm text-left',
          'flex items-center justify-between gap-2',
          'transition-all duration-200 ease-spring',
          open ? 'border-accent shadow-glow-violet-soft' : 'border-border hover:border-accent/40',
        ].join(' ')}
      >
        <span className="text-text-primary">{current?.label || 'Select…'}</span>
        <ChevronDown
          className={['w-4 h-4 text-text-muted transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full glass py-1 animate-fade-up" style={{ animationDuration: '0.15s' }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange?.(opt.value); setOpen(false) }}
              className={[
                'w-full flex items-center justify-between gap-2 px-3 h-9 text-sm',
                'transition-colors',
                opt.value === value
                  ? 'text-accent-glow bg-accent/10'
                  : 'text-text-primary hover:bg-white/5',
              ].join(' ')}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
