import axios from 'axios'
import useSettingsStore from '../store/settingsStore'
import useStoryStyleStore from '../store/storyStyleStore'
import useAuthStore from '../store/authStore'

/**
 * Fire a one-off non-blocking toast when the backend silently fell back
 * to a different provider (e.g. Claude had no credits → we used Gemini).
 * Pages call this after a successful story expansion/breakdown; if the
 * response metadata says `provider_fallback_used: true`, the user gets
 * a friendly info toast.
 *
 * We dispatch a CustomEvent instead of importing useToast directly so
 * the api module stays UI-framework agnostic (it's used outside React
 * contexts like axios interceptors and tests).
 */
export function notifyProviderFallback(response) {
  if (!response || !response.data) return
  const meta = response.data.metadata
  if (!meta || !meta.provider_fallback_used) return

  const used = meta.provider || 'the other provider'
  // Try to find which provider we *tried* to use (the one that failed).
  // We don't have direct access to it, so we infer from the response
  // shape: Claude is the "primary" when the user has set provider=claude
  // OR when no preference is set and the Claude key is present.
  const style = useStoryStyleStore.getState()
  const settings = useSettingsStore.getState()
  let triedFirst = null
  if (settings.storyProvider === 'claude') triedFirst = 'Claude'
  else if (settings.storyProvider === 'gemini') triedFirst = 'Gemini'
  else if (style && settings && settings.storyProvider === 'auto') {
    // Auto + Claude key in body → Claude was tried first
    if (settings.anthropicApiKey) triedFirst = 'Claude'
    else if (settings.googleApiKey) triedFirst = 'Gemini'
  }

  const cap = (s) => (s && s[0] ? s[0].toUpperCase() + s.slice(1) : s)
  const usedCap = cap(used)
  const message = triedFirst && cap(triedFirst) !== usedCap
    ? `${cap(triedFirst)} failed (no credits / no payment method). Used ${usedCap} instead — result is fine, but if you want ${cap(triedFirst)} specifically, add a payment method at the provider.`
    : `Used ${usedCap} for this request. The default provider isn't available right now.`

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vyom:provider-fallback', {
      detail: { provider: used, message, triedFirst },
    }))
  }
}

/**
 * Read the current per-user API keys from the settings store and merge them
 * into a request body. This lets users enter their keys in the in-app
 * Settings page and have them work without restarting the backend, while
 * keeping the keys out of process state and out of localStorage reads at
 * every call site.
 *
 * If the user hasn't entered a key in Settings, the field is `undefined` and
 * Pydantic will treat it as "not supplied" — the backend will then fall back
 * to the .env-configured key.
 *
 * Also reads the user's persistent story style (sample, notes, language,
 * memory) from `storyStyleStore` and forwards it to story endpoints so the
 * model has continuity across sessions.
 */
function parseTokenlbKeyPool(tokenlbApiKey, tokenlbApiKeys) {
  const keys = []
  const primary = (tokenlbApiKey || '').trim()
  if (primary) keys.push(primary)
  for (const line of (tokenlbApiKeys || '').split('\n')) {
    const k = line.trim()
    if (k && !keys.includes(k)) keys.push(k)
  }
  return keys.length ? keys : undefined
}

function withKeys(data = {}) {
  const {
    googleApiKey,
    anthropicApiKey,
    openaiApiKey,
    scenePromptProvider,
    scenePromptOpenaiModel,
    kaggleTunnelUrl,
    tokenlbApiKey,
    tokenlbApiKeys,
    tokenlbBaseUrl,
    tokenlbDefaultModel,
    nanoApiKey,
    nanoApiUrl,
    durexApiKey,
    durexApiUrl,
    durexProxy,
    veoPollSeconds,
    veoUserAgent,
    veoModelVersion,
    veoImageModel,
    enableApiUsageLimits,
    tokenlbDailyLimit,
    nanoDailyLimit,
    veoDailyLimit,
    durexDailyLimit,
    tokenlbMaxTokens,
    tokenlbCreditSaver,
  } = useSettingsStore.getState()

  const style = useStoryStyleStore.getState()
  const sampleStory = style.enableSampleStory && style.sampleStory ? style.sampleStory : ''
  const styleNotes  = style.enableStyleNotes  && style.styleNotes  ? style.styleNotes  : ''
  const memorySummaries = style.includeMemoryInPrompt
    ? (style.rememberedProjects || []).map((p) => p.summary).filter(Boolean)
    : []

  return {
    ...data,
    // Pydantic will only pick these up if the request model declared them.
    google_api_key: googleApiKey || undefined,
    anthropic_api_key: anthropicApiKey || undefined,
    openai_api_key: openaiApiKey || undefined,
    kaggle_tunnel_url: kaggleTunnelUrl || undefined,
    tokenlb_api_key: tokenlbApiKey || undefined,
    tokenlb_api_keys: parseTokenlbKeyPool(tokenlbApiKey, tokenlbApiKeys),
    tokenlb_base_url: tokenlbBaseUrl || undefined,
    tokenlb_model: tokenlbDefaultModel || undefined,
    nano_api_key: nanoApiKey || undefined,
    nano_api_url: nanoApiUrl || undefined,
    durex_api_key: durexApiKey || undefined,
    durex_api_url: durexApiUrl || undefined,
    durex_proxy: durexProxy || undefined,
    veo_poll_seconds: veoPollSeconds || undefined,
    veo_user_agent: veoUserAgent || undefined,
    veo_model: data.veo_model ?? veoModelVersion ?? undefined,
    veo_image_model: data.veo_image_model ?? veoImageModel ?? undefined,
    enable_api_usage_limits: enableApiUsageLimits,
    tokenlb_daily_limit: tokenlbDailyLimit,
    nano_daily_limit: nanoDailyLimit,
    veo_daily_limit: veoDailyLimit,
    durex_daily_limit: durexDailyLimit,
    tokenlb_max_tokens: tokenlbMaxTokens,
    tokenlb_credit_saver: tokenlbCreditSaver,
    // Story-style context — backend builds a system block from these.
    sample_story: sampleStory || undefined,
    style_notes: styleNotes || undefined,
    story_language: style.language || undefined,
    memory_summaries: memorySummaries.length ? memorySummaries : undefined,
  }
}

/** Scene Prompt Studio — Gemini (default), OpenAI, or TokenLB. */
function withScenePromptKeys(data = {}) {
  const {
    scenePromptProvider,
    scenePromptGeminiModel,
    scenePromptOpenaiModel,
    scenePromptModel,
    openaiApiKey,
  } = useSettingsStore.getState()
  const base = withKeys(data)
  const provider = data.scene_prompt_provider || scenePromptProvider || 'gemini'

  if (provider === 'gemini') {
    return {
      ...base,
      scene_prompt_provider: 'gemini',
      gemini_model: data.gemini_model || scenePromptGeminiModel || 'gemini-2.5-flash-lite',
      tokenlb_credit_saver: false,
    }
  }

  if (provider === 'openai') {
    return {
      ...base,
      scene_prompt_provider: 'openai',
      openai_api_key: openaiApiKey || undefined,
      openai_model: data.openai_model || scenePromptOpenaiModel || 'gpt-4o-mini',
      tokenlb_credit_saver: false,
    }
  }

  const model = data.tokenlb_model || scenePromptModel || 'gpt-5.4'
  return {
    ...base,
    scene_prompt_provider: 'tokenlb',
    provider: 'tokenlb',
    tokenlb_model: model,
    tokenlb_credit_saver: false,
    tokenlb_max_tokens: Math.max(base.tokenlb_max_tokens || 1200, 2000),
  }
}

/**
 * Build the axios request config from the settings store: base URL override,
 * custom headers, per-call timeout, etc. Read fresh on every call so changes
 * in Settings take effect immediately.
 */
function requestConfig() {
  const s = useSettingsStore.getState()
  return {
    timeout: (s.requestTimeoutSeconds || 120) * 1000,
    headers: {
      ...(s.customHeaders || {}),
    },
  }
}

// Transient = 5xx, 408, 429, or network error. These are worth retrying.
function isTransient(err) {
  if (!err) return false
  if (!err.response) return true                 // network / timeout
  const code = err.response.status
  return code === 408 || code === 429 || (code >= 500 && code < 600)
}

async function callWithRetry(doRequest) {
  const s = useSettingsStore.getState()
  const max = s.autoRetryOnTransientFailure ? (s.maxRetries || 0) : 0
  const base = s.retryBackoffSeconds || 2
  let attempt = 0
  let lastErr
  while (attempt <= max) {
    try {
      return await doRequest()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === max) throw err
      const wait = base * 2 ** attempt * 1000  // 2s, 4s, 8s ...
      await new Promise((r) => setTimeout(r, wait))
      attempt += 1
    }
  }
  throw lastErr
}

// Resolve the actual base URL. If the user has set one in Settings, use it;
// else fall back to the Vite proxy ("/api"). The `apiBaseUrl` is allowed
// to be a full URL like "http://localhost:8000/api" or a relative path.
function resolveBaseURL() {
  const s = useSettingsStore.getState()
  if (s.apiBaseUrl && s.apiBaseUrl.trim()) return s.apiBaseUrl.trim()
  return '/api'
}

/**
 * Human-readable message from a failed API call.
 */
export function extractApiError(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data
  if (data?.detail && typeof data.detail === 'string') return data.detail
  if (data?.message && typeof data.message === 'string') return data.message
  return fallback
}

/**
 * Turn backend media paths into a URL the browser can load.
 * Signed asset URLs work in img/video tags; legacy /storage/ paths use authenticated API.
 */
export function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (/^https?:\/\//i.test(url)) return url

  const raw = String(url).trim().replace(/\\/g, '/')

  if (raw.includes('/api/storage/assets/')) {
    const path = raw.startsWith('/') ? raw : `/${raw}`
    return path.startsWith('/api/') ? path : `/api${path}`
  }

  let storagePath = raw
  const storageIdx = raw.toLowerCase().indexOf('/storage/')
  if (storageIdx >= 0) {
    storagePath = raw.slice(storageIdx)
  }

  if (storagePath.startsWith('/storage/')) {
    return `/api/storage/file?ref=${encodeURIComponent(storagePath)}`
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`
  const custom = (useSettingsStore.getState().apiBaseUrl || '').trim()
  if (custom && path.startsWith('/api/')) {
    try {
      const origin = new URL(custom, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173').origin
      return `${origin}${path}`
    } catch {
      /* use relative path */
    }
  }
  return path
}

const apiClient = axios.create({
  baseURL: resolveBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Per-request interceptor: rebuild config from settings + optional debug log.
apiClient.interceptors.request.use((cfg) => {
  const fresh = requestConfig()
  if (fresh.timeout) cfg.timeout = fresh.timeout
  if (fresh.headers) cfg.headers = { ...cfg.headers, ...fresh.headers }
  cfg.withCredentials = true
  return cfg
})

// Optional: log full responses to the browser console when debug is on.
apiClient.interceptors.response.use(
  (res) => {
    const s = useSettingsStore.getState()
    if (s.rawResponseDebug) {
      // eslint-disable-next-line no-console
      console.debug('[vyom/api]', res.config.method?.toUpperCase(), res.config.url, res.status, res.data)
    }
    return res
  },
  (err) => {
    const s = useSettingsStore.getState()
    if (s.rawResponseDebug) {
      // eslint-disable-next-line no-console
      console.debug('[vyom/api:err]', err.config?.method?.toUpperCase(), err.config?.url, err.message, err.response?.data)
    }
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      useAuthStore.getState().logout()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
      }
    }
    return Promise.reject(err)
  }
)

export const storyApi = {
  expand: (data) => callWithRetry(() => apiClient.post('/story/expand', withKeys(data))),
  breakdown: (data) => callWithRetry(() => apiClient.post('/story/breakdown', withKeys(data))),
  generatePrompts: (data) => callWithRetry(() => apiClient.post('/story/prompts', withKeys(data))),
  generateScenePromptsBatch: (data) =>
    callWithRetry(() => apiClient.post('/story/scene-prompts-batch', withKeys(data))),
  scenePromptStudio: (data) =>
    callWithRetry(() => apiClient.post('/story/scene-prompt-studio', withScenePromptKeys(data))),
  scenePromptStudioBatch: (data) =>
    callWithRetry(() => apiClient.post('/story/scene-prompt-studio-batch', withScenePromptKeys(data))),
  generateVoiceover: (data) => callWithRetry(() => apiClient.post('/story/voiceover', withKeys(data))),
  generateYoutubeCopy: (data) => callWithRetry(() => apiClient.post('/story/youtube-copy', withKeys(data))),
  enhancePrompt: (data) => callWithRetry(() => apiClient.post('/story/enhance-prompt', withKeys(data))),
  checkConsistency: (data) => callWithRetry(() => apiClient.post('/story/check-consistency', withKeys(data))),
}

export const generateApi = {
  generateImage: (data) => callWithRetry(() => apiClient.post('/generate/image', withKeys(data))),
  enhancePromptVeo: (data) => callWithRetry(() => apiClient.post('/generate/prompt', withKeys(data))),
  batchGenerateImages: (data) => callWithRetry(() => apiClient.post('/generate/batch-images', withKeys(data))),
  generateVideo: (data) => callWithRetry(() => apiClient.post('/generate/video', withKeys(data))),
  generateTts: (data) => callWithRetry(() => apiClient.post('/generate/tts', withKeys(data))),
  batchGenerateVideos: (data) => callWithRetry(() => apiClient.post('/generate/batch-videos', withKeys(data))),
  upscaleImage: (data) => callWithRetry(() => apiClient.post('/generate/upscale', withKeys(data))),
  inpaintImage: (data) => callWithRetry(() => apiClient.post('/generate/inpaint', withKeys(data))),
  removeBackground: (data) => callWithRetry(() => apiClient.post('/generate/remove-bg', withKeys(data))),
}

export const exportApi = {
  assembleVideo: (data, files = {}) => {
    const form = new FormData()
    form.append('payload', JSON.stringify(data))
    if (files.music) form.append('music', files.music)
    if (files.voiceover) form.append('voiceover', files.voiceover)
    return callWithRetry(() =>
      apiClient.post('/export/assemble', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
      }),
    )
  },
  generateSubtitles: (data) => callWithRetry(() => apiClient.post('/export/subtitles', withKeys(data))),
  zipImages: (data) => callWithRetry(() => apiClient.post('/export/zip-images', withKeys(data))),
  zipClips: (data) => callWithRetry(() => apiClient.post('/export/zip-clips', withKeys(data))),
}

export const usageApi = {
  today: () => apiClient.post('/usage/today', withKeys({})),
}

export const pvtApi = {
  transform: (data) => callWithRetry(() => apiClient.post('/pvt/transform-json', withKeys(data))),
  transformVideo: (data) => callWithRetry(() => apiClient.post('/pvt/transform-video-json', withKeys(data))),
  faceCopyImage: (data) => callWithRetry(() => apiClient.post('/pvt/face-copy-image', withKeys(data))),
  faceSwapVideo: (data) => callWithRetry(() => apiClient.post('/pvt/face-swap-video', withKeys(data))),
}

export const projectsApi = {
  listProjects: () => apiClient.get('/projects/'),
  createProject: (data) => apiClient.post('/projects/', data),
  getProject: (id) => apiClient.get(`/projects/${id}`),
  updateProject: (id, data) => apiClient.put(`/projects/${id}`, data),
  deleteProject: (id) => apiClient.delete(`/projects/${id}`),
  listAssets: () => apiClient.get('/projects/assets'),
  createAsset: (data) => apiClient.post('/projects/assets', data),
  listTemplates: () => apiClient.get('/projects/templates'),
  createTemplate: (data) => apiClient.post('/projects/templates', data),
}

export const authApi = {
  register: (data) => apiClient.post('/auth/register', data),
  login: (data) => apiClient.post('/auth/login', data),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  verifyEmail: (data) => apiClient.post('/auth/verify-email', data),
  resendVerification: (data) => apiClient.post('/auth/resend-verification', data),
  checkEmail: (data) => apiClient.post('/auth/check-email', data),
  checkPassword: (data) => apiClient.post('/auth/check-password', data),
}

export const storageApi = {
  listGenerated: () => apiClient.get('/storage/generated'),
  deleteAsset: (assetId) => apiClient.delete(`/storage/assets/${assetId}`),
}

export default apiClient
