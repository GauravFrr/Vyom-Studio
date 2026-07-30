/**
 * Button — variants: primary (violet), gold (amber), ghost, danger.
 * Primary/Gold get a shimmer-sweep overlay on hover. All transitions
 * use the spring easing from the design system.
 */
import { forwardRef } from 'react'

const variants = {
  primary: {
    base: 'relative overflow-hidden text-white bg-violet hover:shadow-glow-violet',
    label: 'bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#6D28D9] bg-[length:200%_100%]',
  },
  gold: {
    base: 'relative overflow-hidden text-bg-base bg-gradient-to-r from-[#F59E0B] to-[#EF4444] hover:shadow-glow-gold',
    label: 'bg-gradient-to-r from-[#FCD34D] via-[#F59E0B] to-[#FCD34D] bg-[length:200%_100%]',
  },
  ghost: {
    base: 'bg-bg-card text-text-primary border border-border hover:border-accent hover:text-white',
    label: '',
  },
  danger: {
    base: 'bg-status-error/15 text-status-error border border-status-error/30 hover:bg-status-error/25',
    label: '',
  },
}

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

const Button = forwardRef(function Button(
  {
    as: As = 'button',
    variant = 'primary',
    size = 'md',
    className = '',
    children,
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    fullWidth = false,
    ...props
  },
  ref
) {
  const v = variants[variant] || variants.primary
  const s = sizes[size] || sizes.md

  return (
    <As
      ref={ref}
      className={[
        'group inline-flex items-center justify-center gap-2 font-medium rounded-button',
        'transition-all duration-200 ease-spring',
        'hover:scale-[1.02] active:scale-[0.98]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
        fullWidth ? 'w-full' : '',
        v.base,
        s,
        className,
      ].join(' ')}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="spinner-ring" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {IconRight && <IconRight className="w-4 h-4 transition-transform duration-200 ease-spring group-hover:translate-x-0.5" />}
      </span>
      {/* Shimmer sweep for primary/gold — runs on hover via group-hover */}
      {(variant === 'primary' || variant === 'gold') && (
        <span
          className={[
            'pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full',
            'transition-transform duration-[600ms] ease-spring',
          ].join(' ')}
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
          }}
          aria-hidden="true"
        />
      )}
    </As>
  )
})

export default Button
