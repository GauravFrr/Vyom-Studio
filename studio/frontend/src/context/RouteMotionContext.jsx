import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import useMotionPreference from '../hooks/useMotionPreference'

const RouteMotionContext = createContext({
  enterComplete: true,
  markEnterComplete: () => {},
})

/**
 * Coordinates PageTransition exit/enter with per-page stagger animations.
 * Pages should keep `animate="hidden"` until `enterComplete` is true so
 * content does not finish animating while the route wrapper is still fading.
 */
export function RouteMotionProvider({ children }) {
  const { pathname } = useLocation()
  const reduce = useMotionPreference()
  const [enterComplete, setEnterComplete] = useState(reduce)

  useEffect(() => {
    if (reduce) {
      setEnterComplete(true)
      return
    }
    setEnterComplete(false)
  }, [pathname, reduce])

  const markEnterComplete = useCallback(() => {
    setEnterComplete(true)
  }, [])

  return (
    <RouteMotionContext.Provider
      value={{ enterComplete: reduce || enterComplete, markEnterComplete }}
    >
      {children}
    </RouteMotionContext.Provider>
  )
}

export function useRouteMotion() {
  return useContext(RouteMotionContext)
}
