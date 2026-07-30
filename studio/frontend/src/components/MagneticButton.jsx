/**
 * MagneticButton — wraps a child button so it subtly tracks the cursor
 * on hover (up to `strength` pixels of translation).
 *
 *  - Uses CSS `transform: translate3d(...)` (GPU only) for cheap updates.
 *  - Cleans up its mousemove listener on unmount.
 *  - Disables itself when the user prefers reduced motion.
 *  - The wrapped child receives no extra props — so any existing
 *    <Button>, <a>, or native <button> can be the child.
 */
import { cloneElement, useRef, useState, useEffect } from 'react'
import useMotionPreference from '../hooks/useMotionPreference'

export default function MagneticButton({ children, strength = 6, className = '' }) {
  const reduce = useMotionPreference()
  const wrapperRef = useRef(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    if (reduce) return
    const el = wrapperRef.current
    if (!el) return

    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      // Clamp to a max magnitude so it never goes wild
      const max = Math.max(rect.width, rect.height) / 2
      const factor = Math.min(1, max / 200)
      setOffset({
        x: Math.max(-strength, Math.min(strength, (dx / max) * strength * factor)),
        y: Math.max(-strength, Math.min(strength, (dy / max) * strength * factor)),
      })
    }
    const onEnter = () => setHovering(true)
    const onLeave = () => {
      setHovering(false)
      setOffset({ x: 0, y: 0 })
    }

    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [reduce, strength])

  if (reduce) {
    return <span className={className}>{children}</span>
  }

  return (
    <span
      ref={wrapperRef}
      className={['inline-block', className].join(' ')}
      style={{
        display: 'inline-block',
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        transition: hovering
          ? 'transform 80ms ease-out'
          : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform',
      }}
    >
      {cloneElement(children)}
    </span>
  )
}
