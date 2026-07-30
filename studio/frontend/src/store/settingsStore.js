import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * VYOM Studio — global settings store.
 *
 * The Settings page (`pages/Settings.jsx`) is the single source of truth for
 * all user-tunable defaults. Anything that should "stick" across reloads
 * lives here, persisted to localStorage under `dadaji-studio-settings`
 * (the name is kept for backward compat — it's the only "Dadaji" left in
 * the codebase that's not user-visible).
 *
 * The store is split into logical groups so Settings can render them as
 * collapsible sections. Each group has a comment + a `_set` helper that's
 * wired in via a single setter factory.
 */

const DEFAULTS = {
  // =====================================================================
  // API keys — set in Settings → API Keys.
  // =====================================================================
  googleApiKey: '',
  anthropicApiKey: '',
  openaiApiKey: '',                    // direct OpenAI — Scene Prompt Studio
  kaggleTunnelUrl: '',
  // TokenLB (https://tokenlb.net/keys) — story / LLM
  tokenlbApiKey: '',
  tokenlbApiKeys: '',                  // extra keys, one per line (pool rotation)
  tokenlbBaseUrl: 'https://tokenlb.net/v1',
  tokenlbDefaultModel: 'gemini-3-flash-preview',
  // Nano Banana Pro — image gen (Hostinger)
  nanoApiKey: 'USAGIWK',
  nanoApiUrl: 'https://gold-newt-367030.hostingersite.com/nano.php',
  // Durex AI — Insta pvt image transform
  durexApiKey: 'durexapi',
  durexApiUrl: 'https://gold-newt-367030.hostingersite.com/durex.php',
  durexProxy: '',                      // IP:PORT:USER:PASS (optional HQ proxy)
  // VEO 3 cloud video/image/prompt APIs
  veoPollSeconds: 85,                  // wait before first video poll
  veoUserAgent: '',
  veoModelVersion: '3.1',              // 3.1 | 2.0 | seedance variants
  grokModelVersion: 'grok-4',          // grok-4 | grok-4.5
  veoImageModel: 'IMAGEN 4',

  // =====================================================================
  // Story pipeline defaults
  // =====================================================================
  // Which provider to use for story generation. 'auto' = use whichever
  // key is set, prefer Claude if both are present. 'claude' / 'gemini'
  // forces a specific provider and 401s if that key is missing.
  storyProvider: 'auto',
  storyDefaultGenre: 'mythological',
  storyDefaultLanguage: 'hindi',
  storyDefaultLength: 'short',          // short | medium | long
  storyDefaultMaxScenes: 6,
  storyDefaultMinSceneDuration: 3,     // seconds
  storyDefaultStyle: 'cinematic',
  // Continuity bible: prepended to every prompt so the same characters
  // look consistent across scenes.
  storyContinuityBible: '',
  // Scene Prompt Studio — universal master prompt (ChatGPT-style workflow)
  scenePromptMasterPrompt: '',
  scenePromptProvider: 'gemini',       // gemini | openai | tokenlb — Scene Prompt Studio
  scenePromptGeminiModel: 'gemini-2.5-flash-lite',
  scenePromptOpenaiModel: 'gpt-4o-mini',
  scenePromptModel: 'gpt-5.4',           // TokenLB path only

  // =====================================================================
  // Image generation defaults
  // =====================================================================
  imageDefaultEngine: 'nano',          // nano | seedance-image | veo-image | grok-image | imagen3 | flux
  imageDefaultStyle: 'cinematic',
  imageDefaultAspect: '9:16',          // 9:16 | 16:9 | 1:1 | 4:3 | 3:4
  imageDefaultResolution: '1024',      // 512 | 768 | 1024 | 1080
  imageDefaultVariations: 1,           // 1–4
  imageDefaultSeed: '',                // empty = random per call
  imageLockSeed: false,                // when true, seed field is sticky
  imageDefaultNegative: '',            // default negative prompt
  imageAutoSaveToProject: true,        // save every successful image

  // =====================================================================
  // Video generation defaults
  // =====================================================================
  videoDefaultEngine: 'veo3',          // veo3 | ltx | cog
  videoDefaultAspect: '9:16',          // VEO: 9:16 | 16:9
  promptEnhanceEngine: 'veo',          // veo | tokenlb
  videoDefaultDuration: 4,             // seconds — Shorts: 4 | 5 | 6
  videoDefaultIntensity: 'medium',     // low | medium | high
  videoDefaultFps: 24,
  videoDefaultLoop: false,
  videoDefaultCameraMovement: 'static',

  // =====================================================================
  // Voiceover (TTS) defaults — Microsoft neural voices
  // =====================================================================
  ttsDefaultVoice: 'hi-IN-MadhurNeural',
  ttsDefaultEmotion: 'storyteller',
  ttsDefaultSpeed: 1.0,

  // =====================================================================
  // Export defaults
  // =====================================================================
  exportDefaultAspect: '9:16',         // 9:16 | 16:9 | 1:1
  exportDefaultTransition: 'fade',     // cut | fade | dissolve
  exportDefaultTransitionDuration: 0.5,
  exportIncludeAudio: true,
  exportIncludeSubtitles: true,
  exportDefaultSubtitleStyle: 'minimal', // minimal | bold | cinematic
  exportDefaultMusic: '',              // path/filename, empty = none
  exportDefaultBitrate: '5000k',

  // =====================================================================
  // Behavior toggles
  // =====================================================================
  autoSaveProjects: true,
  confirmBeforeDelete: true,
  showAdvancedControls: false,         // when true, extra knobs in toolbars
  enableSoundEffects: false,           // UI clicks, generation done
  enableTelemetry: false,              // anonymous usage events
  showEngineToasts: true,              // toast on every generation

  // =====================================================================
  // Performance / limits
  // =====================================================================
  maxConcurrentGenerations: 2,         // parallel API calls
  requestTimeoutSeconds: 120,          // per-call timeout
  autoRetryOnTransientFailure: true,
  maxRetries: 1,                       // fewer retries = fewer credit burns
  retryBackoffSeconds: 2,              // exponential: 2s, 4s, 8s

  // =====================================================================
  // API credit protection (daily caps — UTC midnight reset)
  // =====================================================================
  enableApiUsageLimits: true,
  tokenlbDailyLimit: 15,               // story / LLM calls per day
  nanoDailyLimit: 20,
  veoDailyLimit: 8,
  durexDailyLimit: 10,
  tokenlbMaxTokens: 1200,            // cap output tokens per TokenLB call
  tokenlbCreditSaver: true,          // cheap models for voiceover / enhance / etc.

  // =====================================================================
  // Display & accessibility
  // =====================================================================
  uiDensity: 'comfortable',            // compact | comfortable | spacious
  fontScale: 1.0,                      // 0.9 | 1.0 | 1.1 | 1.2
  reduceMotion: false,                 // honors prefers-reduced-motion if true
  colorBlindSafePalette: false,        // alt colors for protanopia / deuteranopia

  // =====================================================================
  // Privacy & data
  // =====================================================================
  projectHistoryRetentionDays: 90,     // auto-purge after N days
  storeGenerationLogs: true,           // keep last N generations in localStorage
  maxLocalGenerationsKept: 50,
  // KAGGLE / FLUX outputs are persisted server-side too. Toggle off if
  // you want to keep everything in browser memory only.

  // =====================================================================
  // Storage
  // =====================================================================
  storagePath: '../storage',

  // =====================================================================
  // UI
  // =====================================================================
  darkMode: true,                      // dark-only for now
  language: 'english',

  // =====================================================================
  // Developer
  // =====================================================================
  apiBaseUrl: '',                      // empty = use vite proxy (/api)
  logLevel: 'warn',                    // error | warn | info | debug
  customHeaders: {},                   // { "X-Project-Name": "foo" }
  rawResponseDebug: false,             // log full axios responses to console
}

const useSettingsStore = create(
  persist(
    (set) => ({
      ...DEFAULTS,

      // ----- API keys -----
      setGoogleApiKey: (key) => set({ googleApiKey: key }),
      setAnthropicApiKey: (key) => set({ anthropicApiKey: key }),
      setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
      setKaggleTunnelUrl: (url) => set({ kaggleTunnelUrl: url }),
      setTokenlbApiKey: (v) => set({ tokenlbApiKey: v }),
      setTokenlbApiKeys: (v) => set({ tokenlbApiKeys: v }),
      setTokenlbBaseUrl: (v) => set({ tokenlbBaseUrl: v }),
      setTokenlbDefaultModel: (v) => set({ tokenlbDefaultModel: v }),
      setNanoApiKey: (v) => set({ nanoApiKey: v }),
      setNanoApiUrl: (v) => set({ nanoApiUrl: v }),
      setDurexApiKey: (v) => set({ durexApiKey: v }),
      setDurexApiUrl: (v) => set({ durexApiUrl: v }),
      setDurexProxy: (v) => set({ durexProxy: v }),
      setVeoPollSeconds: (v) => set({ veoPollSeconds: v }),
      setVeoUserAgent: (v) => set({ veoUserAgent: v }),
      setPromptEnhanceEngine: (v) => set({ promptEnhanceEngine: v }),

      // ----- Story pipeline -----
      setStoryProvider: (v) => set({ storyProvider: v }),
      setStoryDefaultGenre: (v) => set({ storyDefaultGenre: v }),
      setStoryDefaultLanguage: (v) => set({ storyDefaultLanguage: v }),
      setStoryDefaultLength: (v) => set({ storyDefaultLength: v }),
      setStoryDefaultMaxScenes: (v) => set({ storyDefaultMaxScenes: v }),
      setStoryDefaultMinSceneDuration: (v) => set({ storyDefaultMinSceneDuration: v }),
      setStoryDefaultStyle: (v) => set({ storyDefaultStyle: v }),
      setStoryContinuityBible: (v) => set({ storyContinuityBible: v }),
      setScenePromptMasterPrompt: (v) => set({ scenePromptMasterPrompt: v }),
      setScenePromptProvider: (v) => set({ scenePromptProvider: v }),
      setScenePromptGeminiModel: (v) => set({ scenePromptGeminiModel: v }),
      setScenePromptOpenaiModel: (v) => set({ scenePromptOpenaiModel: v }),
      setScenePromptModel: (v) => set({ scenePromptModel: v }),

      // ----- Image generation -----
      setImageDefaultEngine: (v) => set({ imageDefaultEngine: v }),
      setImageDefaultStyle: (v) => set({ imageDefaultStyle: v }),
      setImageDefaultAspect: (v) => set({ imageDefaultAspect: v }),
      setImageDefaultResolution: (v) => set({ imageDefaultResolution: v }),
      setImageDefaultVariations: (v) => set({ imageDefaultVariations: v }),
      setImageDefaultSeed: (v) => set({ imageDefaultSeed: v }),
      setImageLockSeed: (v) => set({ imageLockSeed: v }),
      setImageDefaultNegative: (v) => set({ imageDefaultNegative: v }),
      setImageAutoSaveToProject: (v) => set({ imageAutoSaveToProject: v }),

      // ----- Video generation -----
      setVideoDefaultEngine: (v) => set({ videoDefaultEngine: v }),
      setVideoDefaultDuration: (v) => set({ videoDefaultDuration: v }),
      setVideoDefaultIntensity: (v) => set({ videoDefaultIntensity: v }),
      setVideoDefaultFps: (v) => set({ videoDefaultFps: v }),
      setVideoDefaultLoop: (v) => set({ videoDefaultLoop: v }),
      setVideoDefaultCameraMovement: (v) => set({ videoDefaultCameraMovement: v }),

      // ----- Export -----
      setExportDefaultAspect: (v) => set({ exportDefaultAspect: v }),
      setExportDefaultTransition: (v) => set({ exportDefaultTransition: v }),
      setExportDefaultTransitionDuration: (v) => set({ exportDefaultTransitionDuration: v }),
      setExportIncludeAudio: (v) => set({ exportIncludeAudio: v }),
      setExportIncludeSubtitles: (v) => set({ exportIncludeSubtitles: v }),
      setExportDefaultSubtitleStyle: (v) => set({ exportDefaultSubtitleStyle: v }),
      setExportDefaultMusic: (v) => set({ exportDefaultMusic: v }),
      setExportDefaultBitrate: (v) => set({ exportDefaultBitrate: v }),

      // ----- Behavior -----
      setAutoSaveProjects: (v) => set({ autoSaveProjects: v }),
      setConfirmBeforeDelete: (v) => set({ confirmBeforeDelete: v }),
      setShowAdvancedControls: (v) => set({ showAdvancedControls: v }),
      setEnableSoundEffects: (v) => set({ enableSoundEffects: v }),
      setEnableTelemetry: (v) => set({ enableTelemetry: v }),
      setShowEngineToasts: (v) => set({ showEngineToasts: v }),

      // ----- Performance -----
      setMaxConcurrentGenerations: (v) => set({ maxConcurrentGenerations: v }),
      setRequestTimeoutSeconds: (v) => set({ requestTimeoutSeconds: v }),
      setAutoRetryOnTransientFailure: (v) => set({ autoRetryOnTransientFailure: v }),
      setMaxRetries: (v) => set({ maxRetries: v }),
      setRetryBackoffSeconds: (v) => set({ retryBackoffSeconds: v }),
      setEnableApiUsageLimits: (v) => set({ enableApiUsageLimits: v }),
      setTokenlbDailyLimit: (v) => set({ tokenlbDailyLimit: v }),
      setNanoDailyLimit: (v) => set({ nanoDailyLimit: v }),
      setVeoDailyLimit: (v) => set({ veoDailyLimit: v }),
      setDurexDailyLimit: (v) => set({ durexDailyLimit: v }),
      setTokenlbMaxTokens: (v) => set({ tokenlbMaxTokens: v }),
      setTokenlbCreditSaver: (v) => set({ tokenlbCreditSaver: v }),

      // ----- Display -----
      setUiDensity: (v) => set({ uiDensity: v }),
      setFontScale: (v) => set({ fontScale: v }),
      setReduceMotion: (v) => set({ reduceMotion: v }),
      setColorBlindSafePalette: (v) => set({ colorBlindSafePalette: v }),

      // ----- Privacy -----
      setProjectHistoryRetentionDays: (v) => set({ projectHistoryRetentionDays: v }),
      setStoreGenerationLogs: (v) => set({ storeGenerationLogs: v }),
      setMaxLocalGenerationsKept: (v) => set({ maxLocalGenerationsKept: v }),

      // ----- Storage -----
      setStoragePath: (path) => set({ storagePath: path }),

      // ----- UI -----
      setDarkMode: (enabled) => set({ darkMode: enabled }),
      setLanguage: (lang) => set({ language: lang }),

      // ----- Developer -----
      setApiBaseUrl: (v) => set({ apiBaseUrl: v }),
      setLogLevel: (v) => set({ logLevel: v }),
      setCustomHeaders: (v) => set({ customHeaders: v }),
      setRawResponseDebug: (v) => set({ rawResponseDebug: v }),

      // ----- Bulk -----
      resetDefaults: () => set(DEFAULTS),
      importSettings: (partial) => set((s) => ({ ...s, ...partial })),
    }),
    {
      name: 'dadaji-studio-settings',
      version: 10,                       // bump to bust old localStorage
      // Only persist the user-tunable fields (not the setter functions).
      partialize: (state) => {
        const persisted = {}
        for (const k of Object.keys(DEFAULTS)) persisted[k] = state[k]
        return persisted
      },
    }
  )
)

export default useSettingsStore
