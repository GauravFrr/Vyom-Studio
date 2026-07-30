import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink, Key } from 'lucide-react'
import Button from './Button'

/**
 * FriendlyError
 *
 * Renders an inline error block that detects known backend error patterns
 * and shows a useful CTA alongside the raw message — instead of just dumping
 * the raw `detail` string in red.
 *
 * Recognised patterns:
 *   * "paid plans"  → user needs AI Studio billing; show a Settings link
 *                     plus an external link to aistudio.google.com/settings/billing
 *   * "API key"     → user has no Google/Anthropic key configured; link to Settings
 *   * "Kaggle … forwarding"  → no tunnel URL set; link to Settings
 *   * default       → plain red text with the raw error
 */
/** Strip third-party provider hostnames from messages shown in the UI. */
function sanitizeErrorMessage(msg) {
  return String(msg)
    .replace(/veoaifree\.com/gi, 'the cloud API')
    .replace(/veoaifree/gi, 'the cloud API')
}

export default function FriendlyError({ error }) {
  if (!error) return null
  const raw = sanitizeErrorMessage(error)
  const lower = raw.toLowerCase()

  // ---------------------------------------------------------------- pattern match
  if (lower.includes('paid plans') || lower.includes('is only available on paid')) {
    return (
      <div className="p-4 rounded-input bg-status-error/10 border border-status-error/30 text-sm space-y-3">
        <div className="flex items-start gap-2 text-status-error">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Imagen requires a paid Google AI Studio plan</div>
            <p className="text-text-secondary text-xs mt-1">
              Your current API key is on the free tier, which doesn't include Imagen.
              Google Pro / Google One subscriptions don't unlock the API — only billing
              enabled on the AI Studio project does.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://aistudio.google.com/settings/billing"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" icon={ExternalLink}>
              Enable AI Studio billing
            </Button>
          </a>
          <Link to="/settings">
            <Button size="sm" variant="ghost" icon={Key}>
              Update API key
            </Button>
          </Link>
        </div>
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer hover:text-text-secondary">Show raw error</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{raw}</pre>
        </details>
      </div>
    )
  }

  if (lower.includes('api key') || lower.includes('not configured')) {
    return (
      <div className="p-4 rounded-input bg-status-error/10 border border-status-error/30 text-sm space-y-3">
        <div className="flex items-start gap-2 text-status-error">
          <Key className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">No API key configured</div>
            <p className="text-text-secondary text-xs mt-1">
              Add your API key in Settings → API Keys. The key is saved to your
              browser's localStorage only — it's never sent anywhere except the
              relevant provider.
            </p>
          </div>
        </div>
        <Link to="/settings">
          <Button size="sm" icon={Key}>
            Open Settings
          </Button>
        </Link>
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer hover:text-text-secondary">Show raw error</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{raw}</pre>
        </details>
      </div>
    )
  }

  if (lower.includes('ffmpeg') && (lower.includes('not installed') || lower.includes('not in path'))) {
    return (
      <div className="p-4 rounded-input bg-status-error/10 border border-status-error/30 text-sm space-y-3">
        <div className="flex items-start gap-2 text-status-error">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">FFmpeg required for export</div>
            <p className="text-text-secondary text-xs mt-1">
              Install FFmpeg and add it to your system PATH, then restart the backend server.
              On Windows: download from ffmpeg.org or run{' '}
              <code className="font-mono">winget install ffmpeg</code>.
            </p>
          </div>
        </div>
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer hover:text-text-secondary">Show raw error</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{raw}</pre>
        </details>
      </div>
    )
  }

  if (lower.includes('kaggle') && lower.includes('forwarding')) {
    return (
      <div className="p-4 rounded-input bg-status-error/10 border border-status-error/30 text-sm space-y-3">
        <div className="flex items-start gap-2 text-status-error">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Kaggle GPU server unreachable</div>
            <p className="text-text-secondary text-xs mt-1">
              The Kaggle FLUX.1 / LTX-Video engine runs on a remote GPU notebook.
              Enter the tunnel URL in Settings → API Keys (or set
              <code className="font-mono"> KAGGLE_TUNNEL_URL</code> in
              <code className="font-mono"> .env</code>). See SETUP.md for the
              full walkthrough.
            </p>
          </div>
        </div>
        <Link to="/settings">
          <Button size="sm" icon={Key}>
            Set tunnel URL
          </Button>
        </Link>
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer hover:text-text-secondary">Show raw error</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{raw}</pre>
        </details>
      </div>
    )
  }

  // default
  return (
    <div className="p-3 rounded-input bg-status-error/10 border border-status-error/30 text-sm text-status-error">
      {raw}
    </div>
  )
}
