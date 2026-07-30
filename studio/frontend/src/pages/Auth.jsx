import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Mail, ShieldCheck, AlertCircle } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import FriendlyError from '../components/ui/FriendlyError'
import PasswordStrength from '../components/auth/PasswordStrength'
import { authApi, extractApiError } from '../api/client'
import useAuthStore from '../store/authStore'
import useMotionPreference from '../hooks/useMotionPreference'
import { SMOOTH_EASE } from '../hooks/useHomeIntro'
import {
  isPasswordStrong,
  validateEmailFormat,
  validateName,
  validateRegistrationForm,
} from '../utils/authValidation'

const authPage = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.7, ease: SMOOTH_EASE, staggerChildren: 0.11, delayChildren: 0.06 },
  },
}

const authItem = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: SMOOTH_EASE },
  },
}

const authCard = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.75, ease: SMOOTH_EASE },
  },
}

const formStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
}

const formField = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: SMOOTH_EASE },
  },
}

function AuthBackground({ reduce }) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="aurora-bg" />
      {!reduce && (
        <>
          <motion.div
            className="absolute w-[min(520px,90vw)] h-[min(520px,90vw)] rounded-full bg-violet-600/25 blur-[110px] -top-24 -left-28"
            animate={{ x: [0, 36, 0], y: [0, 28, 0], scale: [1, 1.06, 1] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute w-[min(400px,80vw)] h-[min(400px,80vw)] rounded-full bg-indigo-500/15 blur-[100px] top-1/3 -right-24"
            animate={{ x: [0, -28, 0], y: [0, 20, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
          />
          <motion.div
            className="absolute w-[min(360px,70vw)] h-[min(360px,70vw)] rounded-full bg-amber-500/10 blur-[90px] -bottom-20 left-1/4"
            animate={{ x: [0, 22, 0], y: [0, -18, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
          />
        </>
      )}
    </div>
  )
}

function AuthShell({ title, accent, subtitle, children }) {
  const reduce = useMotionPreference()
  const motionProps = reduce
    ? {}
    : { variants: authPage, initial: 'hidden', animate: 'visible' }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <AuthBackground reduce={reduce} />
      <motion.div className="relative z-10 w-full max-w-[420px]" {...motionProps}>
        <motion.header variants={reduce ? undefined : authItem} className="text-center mb-8">
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill glass text-[10px] text-text-secondary uppercase tracking-[0.2em] mb-5"
            whileHover={reduce ? undefined : { scale: 1.03 }}
            transition={{ duration: 0.25, ease: SMOOTH_EASE }}
          >
            <motion.span
              animate={reduce ? undefined : { rotate: [0, 8, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent-glow" />
            </motion.span>
            VYOM Studio
          </motion.div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-text-primary">
            {title}{' '}
            {accent && <span className="text-gradient-violet">{accent}</span>}
          </h1>
          <p className="text-text-secondary mt-2.5 text-sm leading-relaxed max-w-xs mx-auto">{subtitle}</p>
        </motion.header>

        <motion.div variants={reduce ? undefined : authCard} className="auth-card-shell">
          <Card>{children}</Card>
        </motion.div>
      </motion.div>
    </div>
  )
}

function AuthFormShell({ children, onSubmit }) {
  const reduce = useMotionPreference()
  const motionProps = reduce
    ? {}
    : { variants: formStagger, initial: 'hidden', animate: 'visible' }

  return (
    <motion.form onSubmit={onSubmit} className="space-y-4" {...motionProps}>
      {children}
    </motion.form>
  )
}

function AnimatedField({ children }) {
  const reduce = useMotionPreference()
  if (reduce) return children
  return <motion.div variants={formField}>{children}</motion.div>
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((s) => s.setAuth)
  const reduce = useMotionPreference()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const from = location.state?.from || '/'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login({ email: email.trim(), password })
      const dest = from || '/'
      setAuth(res.data.user, { welcomeIntro: dest === '/' })
      navigate(dest, { replace: true })
    } catch (err) {
      setError(extractApiError(err, 'Login failed. Check your email and password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome" accent="back" subtitle="Sign in to your story studio">
      <AuthFormShell onSubmit={handleSubmit}>
        <AnimatedField>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </AnimatedField>
        <AnimatedField>
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </AnimatedField>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key={error}
              initial={reduce ? false : { opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.35, ease: SMOOTH_EASE }}
            >
              <FriendlyError error={error} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatedField>
          <motion.div whileTap={reduce ? undefined : { scale: 0.985 }} transition={{ duration: 0.15 }}>
            <Button type="submit" fullWidth loading={loading} size="lg">
              Sign in
            </Button>
          </motion.div>
        </AnimatedField>

        <motion.p
          variants={reduce ? undefined : formField}
          className="text-center text-sm text-text-muted pt-1"
        >
          No account?{' '}
          <Link to="/register" className="auth-link font-medium">
            Create one
          </Link>
        </motion.p>
      </AuthFormShell>
    </AuthShell>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const reduce = useMotionPreference()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const emailCheckRef = useRef(0)

  useEffect(() => {
    const formatErr = validateEmailFormat(email)
    if (formatErr) {
      setEmailError(formatErr)
      setEmailVerified(false)
      setEmailChecking(false)
      return
    }

    setEmailChecking(true)
    setEmailError('')
    const ticket = ++emailCheckRef.current
    const timer = setTimeout(async () => {
      try {
        const res = await authApi.checkEmail({ email: email.trim() })
        if (ticket !== emailCheckRef.current) return
        if (res.data?.valid) {
          setEmailVerified(true)
          setEmailError('')
        } else {
          setEmailVerified(false)
          setEmailError(res.data?.detail || 'This email does not look valid.')
        }
      } catch {
        if (ticket !== emailCheckRef.current) return
        setEmailVerified(false)
        setEmailError('Could not verify this email right now.')
      } finally {
        if (ticket === emailCheckRef.current) setEmailChecking(false)
      }
    }, 650)

    return () => clearTimeout(timer)
  }, [email])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')

    const formErr = validateRegistrationForm({ name, email, password })
    if (formErr) {
      setError(formErr)
      return
    }
    if (!emailVerified) {
      setError(emailError || 'Please enter a reachable email address.')
      return
    }
    if (!isPasswordStrong(password)) {
      setError('Password does not meet all requirements below.')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
      })
      setAuth(res.data.user, { welcomeIntro: true })
      if (res.data.verification_required) {
        setInfo(
          res.data.message
            || 'Account created. Check your email for the verification link. Without SMTP configured, the link appears in the backend terminal log.'
        )
        navigate('/', { replace: true })
        return
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractApiError(err, 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Create" accent="account" subtitle="Your projects and scenes stay private to you">
      <AuthFormShell onSubmit={handleSubmit}>
        <AnimatedField>
          <Input
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(validateName(e.target.value) || '')
            }}
            onBlur={() => setNameError(validateName(name) || '')}
            autoComplete="name"
            required
          />
          {nameError && <p className="mt-1.5 text-[11px] text-status-error">{nameError}</p>}
        </AnimatedField>
        <AnimatedField>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <div className="mt-1.5 min-h-[16px]">
            {emailChecking && (
              <p className="text-[11px] text-text-muted">Checking email domain…</p>
            )}
            {!emailChecking && emailVerified && email && (
              <p className="text-[11px] text-status-success flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Email looks valid
              </p>
            )}
            {!emailChecking && emailError && (
              <p className="text-[11px] text-status-error flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {emailError}
              </p>
            )}
          </div>
        </AnimatedField>
        <AnimatedField>
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </AnimatedField>
        <AnimatedField>
          <PasswordStrength password={password} />
          <p className="text-[11px] text-text-muted leading-relaxed mt-2">
            After signup you must verify your email before generating images or videos.
            First account on this machine claims existing local projects.
          </p>
        </AnimatedField>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key={error}
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: SMOOTH_EASE }}
            >
              <FriendlyError error={error} />
            </motion.div>
          )}
          {info && (
            <motion.p
              key={info}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-accent-glow"
            >
              {info}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatedField>
          <motion.div whileTap={reduce ? undefined : { scale: 0.985 }}>
            <Button
              type="submit"
              fullWidth
              loading={loading}
              size="lg"
              icon={Sparkles}
              disabled={loading || emailChecking || (email.length > 0 && !emailVerified) || !isPasswordStrong(password)}
            >
              Create account
            </Button>
          </motion.div>
        </AnimatedField>

        <motion.p variants={reduce ? undefined : formField} className="text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="auth-link font-medium">
            Sign in
          </Link>
        </motion.p>
      </AuthFormShell>
    </AuthShell>
  )
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState(token ? 'loading' : 'pending')
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const setAuth = useAuthStore((s) => s.setAuth)
  const authUser = useAuthStore((s) => s.user)
  const reduce = useMotionPreference()
  const verifyOnce = useRef(false)

  useEffect(() => {
    if (authUser?.email) setResendEmail(authUser.email)
  }, [authUser?.email])

  useEffect(() => {
    if (!token || verifyOnce.current) return
    verifyOnce.current = true

    const finishVerified = async (msg) => {
      setStatus('ok')
      setMessage(msg)
      try {
        const me = await authApi.me()
        if (me.data?.user) setAuth(me.data.user)
      } catch {
        /* ignore */
      }
    }

    authApi.verifyEmail({ token })
      .then((res) => finishVerified(res.data?.message || 'Email verified. You can use all features now.'))
      .catch(async (err) => {
        try {
          const me = await authApi.me()
          if (me.data?.user?.email_verified) {
            setAuth(me.data.user)
            await finishVerified('Email already verified. You can use all features now.')
            return
          }
        } catch {
          /* ignore */
        }
        setStatus('error')
        setMessage(extractApiError(err, 'Verification failed.'))
      })
  }, [token, setAuth])

  const handleResend = async (e) => {
    e.preventDefault()
    const email = resendEmail.trim()
    if (!email) {
      setResendMessage('Enter the email you used to register.')
      return
    }
    setResendLoading(true)
    setResendMessage('')
    try {
      const res = await authApi.resendVerification({ email })
      setResendMessage(res.data?.message || 'If that account exists, we sent a new link.')
    } catch (err) {
      setResendMessage(extractApiError(err))
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <AuthShell title="Verify" accent="email" subtitle="Confirm your account to unlock the studio">
      {status === 'loading' && (
        <motion.div
          className="flex flex-col items-center gap-4 py-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="spinner-ring" />
          <p className="text-sm text-text-muted">Verifying your email…</p>
        </motion.div>
      )}

      {status === 'pending' && (
        <motion.div
          className="space-y-5"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: SMOOTH_EASE }}
        >
          <div className="flex items-start gap-3 rounded-input border border-border-subtle bg-bg-elevated/80 p-4">
            <Mail className="w-5 h-5 text-accent-glow shrink-0 mt-0.5" />
            <div className="text-sm text-text-secondary space-y-2">
              <p className="text-text-primary font-medium">Check your inbox</p>
              <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                <li>Open the verification email from VYOM Studio</li>
                <li>Click <strong className="text-text-primary">Verify email</strong></li>
                <li>Return here or go to the dashboard</li>
              </ol>
              <p className="text-[11px] text-text-muted pt-1">
                No SMTP yet? The verification link is printed in your backend terminal when you register.
              </p>
            </div>
          </div>

          <form onSubmit={handleResend} className="space-y-3">
            <Input
              label="Resend to email"
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              autoComplete="email"
              required
            />
            {resendMessage && (
              <p className="text-xs text-text-muted">{resendMessage}</p>
            )}
            <Button type="submit" fullWidth loading={resendLoading}>
              Resend verification email
            </Button>
          </form>

          <Button as={Link} to="/login" variant="ghost" fullWidth>
            Back to sign in
          </Button>
        </motion.div>
      )}

      {(status === 'ok' || status === 'error') && (
        <motion.div
          className="space-y-4"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: SMOOTH_EASE }}
        >
          <p className={`text-sm ${status === 'ok' ? 'text-accent-glow' : 'text-status-error'}`}>{message}</p>

          {status === 'error' && (
            <form onSubmit={handleResend} className="space-y-3">
              <Input
                label="Resend to email"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                autoComplete="email"
                required
              />
              {resendMessage && <p className="text-xs text-text-muted">{resendMessage}</p>}
              <Button type="submit" fullWidth loading={resendLoading} variant="ghost">
                Send a new link
              </Button>
            </form>
          )}

          <Button as={Link} to="/" fullWidth>
            Go to dashboard
          </Button>
        </motion.div>
      )}
    </AuthShell>
  )
}
