import { useState } from 'react'
import { Mail } from 'lucide-react'
import { authApi, extractApiError } from '../api/client'
import useAuthStore from '../store/authStore'
import Button from './ui/Button'

export default function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  if (!user || user.email_verified !== false) return null

  const resend = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await authApi.resendVerification({ email: user.email })
      setMessage(res.data?.message || 'Verification email sent.')
    } catch (err) {
      setMessage(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    try {
      const res = await authApi.me()
      if (res.data?.user) setAuth(res.data.user)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-4 mt-4 lg:mx-0 rounded-button border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <Mail className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-text-primary">Verify your email</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Generation and export stay locked until you verify. Check your inbox, open the link, or resend below.
          </p>
          <p className="text-[10px] text-text-muted mt-1">
            Dev tip: without SMTP, the link is logged in the backend terminal when you register.
          </p>
          {message && <p className="text-xs text-text-muted mt-1">{message}</p>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={refresh}>I verified</Button>
        <Button size="sm" loading={loading} onClick={resend}>Resend email</Button>
      </div>
    </div>
  )
}
