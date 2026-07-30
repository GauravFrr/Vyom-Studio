/**
 * Card — glass surface, hover lift + violet border glow.
 * Use `interactive` to enable the hover effect (used on clickable cards).
 */
export default function Card({
  children,
  className = '',
  interactive = false,
  as: As = 'div',
  ...props
}) {
  return (
    <As
      className={[
        'glass card-pad',
        interactive
          ? 'transition-all duration-[250ms] ease-spring hover:-translate-y-0.5 hover:border-accent hover:shadow-card-hover'
          : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </As>
  )
}
