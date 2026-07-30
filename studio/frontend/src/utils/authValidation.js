/** Client-side registration validation — mirrors backend rules. */

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'sharklasers.com',
  'grr.la',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'yopmail.com',
  'throwaway.email',
  'getnada.com',
  'maildrop.cc',
  'trashmail.com',
  'fakeinbox.com',
  'dispostable.com',
  'mintemail.com',
  'emailondeck.com',
])

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 && p.length <= 128 },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number (0–9)', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'One special character (!@#$…)', test: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~]/.test(p) },
  { id: 'space', label: 'No spaces', test: (p) => !/\s/.test(p) },
]

export function passwordChecklist(password) {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(password || ''),
  }))
}

export function isPasswordStrong(password) {
  return PASSWORD_RULES.every((rule) => rule.test(password || ''))
}

export function validateName(name) {
  const cleaned = (name || '').trim()
  if (cleaned.length < 2) return 'Name must be at least 2 characters.'
  if (cleaned.length > 120) return 'Name must be at most 120 characters.'
  if (!/[\w\u0080-\uFFFF]/.test(cleaned)) return 'Name must contain at least one letter or number.'
  return null
}

export function validateEmailFormat(email) {
  const value = (email || '').trim().toLowerCase()
  if (!value) return 'Email is required.'
  if (!EMAIL_FORMAT.test(value)) return 'Enter a valid email address.'
  const domain = value.split('@')[1]
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return 'Temporary or disposable email addresses are not allowed.'
  }
  return null
}

export function validateRegistrationForm({ name, email, password }) {
  const nameErr = validateName(name)
  if (nameErr) return nameErr
  const emailErr = validateEmailFormat(email)
  if (emailErr) return emailErr
  if (!isPasswordStrong(password)) {
    return 'Password does not meet all requirements below.'
  }
  return null
}
