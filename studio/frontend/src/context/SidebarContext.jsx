/**
 * SidebarContext — closed by default so first visit shows full dashboard.
 * User opens via hamburger; preference persists in localStorage.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'dadaji-studio-sidebar'

const SidebarContext = createContext(null)

export function SidebarProvider({ children }) {
  const [open, setOpenState] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored != null) return stored === 'true'
    } catch {
      /* localStorage unavailable */
    }
    return false
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(open))
    } catch {
      /* ignore */
    }
  }, [open])

  const toggle = useCallback(() => setOpenState((v) => !v), [])
  const setOpen = useCallback((v) => setOpenState(v), [])

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within <SidebarProvider>')
  return ctx
}
