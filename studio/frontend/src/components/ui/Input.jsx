import { useId, useState } from 'react'

/**
 * Input / Textarea with floating label + left accent bar on focus.
 * `multiline` switches to <textarea>; default is single-line.
 */
export default function Input({
  label,
  value,
  onChange,
  placeholder = ' ',
  type = 'text',
  multiline = false,
  rows = 4,
  maxLength,
  className = '',
  inputClassName = '',
  rightAdornment,
  mono = false,
  variant = 'default', // default | light
  ...props
}) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const hasValue = value != null && value !== ''
  const hasLabel = Boolean(label)
  const isLight = variant === 'light'

  const baseInput = [
    'peer w-full rounded-input border ring-0 focus:ring-0',
    'transition-all duration-200 ease-spring',
    'focus:outline-none focus:border-accent focus:shadow-none',
    isLight
      ? 'input-light'
      : 'bg-bg-elevated text-text-primary border-border-subtle placeholder-transparent',
    hasLabel ? 'px-3.5 pt-5 pb-2' : 'px-3.5 py-2.5',
    hasLabel ? '' : isLight ? 'placeholder:text-input-placeholder' : 'placeholder:text-text-muted',
    mono ? 'font-mono text-sm' : 'text-sm',
    rightAdornment ? 'pr-12' : '',
    inputClassName,
  ].join(' ')

  return (
    <div className={className}>
      {/* Inner shell — accent bar height matches the field only (not the counter below). */}
      <div className="relative">
        <span
          className={[
            'absolute left-1.5 w-0.5 rounded-full bg-accent pointer-events-none z-[1]',
            'transition-opacity duration-200 ease-spring',
            multiline ? 'top-3 bottom-3' : 'top-1/2 h-5 -translate-y-1/2',
            focused ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          aria-hidden="true"
        />

        {multiline ? (
          <textarea
            id={id}
            value={value ?? ''}
            onChange={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            rows={rows}
            maxLength={maxLength}
            className={baseInput}
            {...props}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value ?? ''}
            onChange={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            maxLength={maxLength}
            className={baseInput}
            {...props}
          />
        )}

        {hasLabel && (
          <label
            htmlFor={id}
            className={[
              'absolute left-3.5 pointer-events-none z-[2]',
              'transition-all duration-200 ease-spring origin-left',
              mono ? 'font-mono' : '',
              focused || hasValue
                ? ['top-1.5 text-[10px] uppercase tracking-widest', isLight ? 'text-accent' : 'text-accent-glow'].join(' ')
                : multiline
                  ? 'top-4 text-sm text-text-muted'
                  : 'top-1/2 -translate-y-1/2 text-sm text-text-muted',
            ].join(' ')}
          >
            {label}
          </label>
        )}

        {rightAdornment && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted z-[2]">
            {rightAdornment}
          </div>
        )}
      </div>

      {maxLength != null && multiline && (
        <div className="mt-1 text-right text-[10px] text-text-muted">
          {(value || '').length} / {maxLength}
        </div>
      )}
    </div>
  )
}
