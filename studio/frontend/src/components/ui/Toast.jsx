/**
 * Toast — notification that slides in from top-right and auto-dismisses.
 * Wrap children with <Toaster /> to mount the host; use the `toast()`
 * export to fire a notification from anywhere.
 */
import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { CheckCircle2, AlertCircle, Info, X, Sparkles } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: { Icon: CheckCircle2, ring: 'border-status-success/40', text: 'text-status-success' },
  error:   { Icon: AlertCircle,  ring: 'border-status-error/40',   text: 'text-status-error'   },
  info:    { Icon: Info,         ring: 'border-status-info/40',    text: 'text-status-info'    },
  violet:  { Icon: Sparkles,     ring: 'border-accent/40',         text: 'text-accent-glow'    },
}

export function Toaster({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((opts) => {
    const id = Math.random().toString(36).slice(2)
    const t = { id, kind: 'info', duration: 3500, ...opts }
    setToasts((arr) => [...arr, t])
    setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== id)), t.duration)
  }, [])

  const dismiss = (id) => setToasts((arr) => arr.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const cfg = ICONS[t.kind] || ICONS.info
          const { Icon } = cfg
          return (
            <div
              key={t.id}
              className={[
                'pointer-events-auto glass px-4 py-3 min-w-[280px] max-w-sm',
                'flex items-start gap-3 border',
                cfg.ring,
                'animate-toast-in',
              ].join(' ')}
              role="status"
            >
              <Icon className={['w-4 h-4 flex-shrink-0 mt-0.5', cfg.text].join(' ')} />
              <div className="flex-1 min-w-0">
                {t.title && <p className="text-sm font-semibold text-text-primary">{t.title}</p>}
                {t.message && <p className="text-xs text-text-secondary mt-0.5">{t.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-text-muted hover:text-text-primary flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
