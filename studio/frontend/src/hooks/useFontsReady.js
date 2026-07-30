import { useEffect, useState } from 'react'

/** Wait for webfonts before first-visit intro — prevents Syne/DM Sans swap glitch. */
export default function useFontsReady() {
  const [ready, setReady] = useState(() => {
    if (typeof document === 'undefined') return true
    return !document.fonts
  })

  useEffect(() => {
    if (!document.fonts?.ready) {
      setReady(true)
      return
    }
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return ready
}
