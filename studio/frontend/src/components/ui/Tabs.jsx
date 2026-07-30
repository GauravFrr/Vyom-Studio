/**
 * Tabs — sliding underline indicator for tab navigation. Used for
 * status filters in Storyboard, asset categories in Asset Library, etc.
 */
import { useRef, useLayoutEffect, useState } from 'react'

export default function Tabs({ tabs, value, onChange, className = '' }) {
  const refs = useRef({})
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const node = refs.current[value]
    if (node) setIndicator({ left: node.offsetLeft, width: node.offsetWidth })
  }, [value, tabs])

  return (
    <div className={['relative inline-flex border-b border-border', className].join(' ')}>
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => (refs.current[t.value] = el)}
            type="button"
            onClick={() => onChange(t.value)}
            className={[
              'relative px-4 h-10 text-sm font-medium',
              'transition-colors duration-200',
              active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.icon && <t.icon className="w-3.5 h-3.5" />}
              {t.label}
              {t.count != null && (
                <span className="text-[10px] text-text-muted font-mono">({t.count})</span>
              )}
            </span>
          </button>
        )
      })}
      <span
        className="absolute bottom-0 h-0.5 bg-accent shadow-glow-violet-soft rounded-full transition-all duration-300 ease-spring"
        style={{ left: indicator.left, width: indicator.width }}
        aria-hidden="true"
      />
    </div>
  )
}
