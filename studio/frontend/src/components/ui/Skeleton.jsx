/**
 * Skeleton — shimmer placeholder for loading content.
 * Pass `className` to control shape (e.g. "h-32 w-full rounded-card").
 */
export default function Skeleton({ className = '' }) {
  return <div className={['skeleton', className].join(' ')} aria-hidden="true" />
}
