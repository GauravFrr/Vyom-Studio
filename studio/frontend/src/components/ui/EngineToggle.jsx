/**
 * EngineToggle — segmented pill control with equal-width slots and a
 * spring-animated highlight. Use for binary or small multi-option choices.
 */
import { useId } from 'react'
import { motion } from 'framer-motion'
import useMotionPreference from '../../hooks/useMotionPreference'

const SIZES = {
  md: 'h-10 text-sm',
  lg: 'h-12 text-sm',
}

export default function EngineToggle({
  value,
  onChange,
  options,
  className = '',
  size = 'md',
}) {
  const reduce = useMotionPreference()
  const pillId = useId().replace(/:/g, '')
  const sizeClass = SIZES[size] || SIZES.md

  return (
    <div
      className={[
        'relative flex w-full p-1 rounded-pill',
        'bg-bg-elevated/90 border border-border-subtle',
        className,
      ].join(' ')}
      role="group"
    >
      {options.map((opt) => {
        const Icon = opt.icon
        const active = value === opt.value

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={[
              'relative z-10 flex flex-1 min-w-0 items-center justify-center gap-1.5',
              'px-3 rounded-pill font-medium transition-colors duration-250',
              sizeClass,
              active
                ? 'text-white'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-pill bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#6D28D9] shadow-glow-violet-soft"
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5 min-w-0">
              {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className={['truncate', active ? 'font-semibold' : 'font-medium'].join(' ')}>
                {opt.label}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
