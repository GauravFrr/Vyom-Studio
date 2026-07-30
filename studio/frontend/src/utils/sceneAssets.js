/** Session handoffs + scene asset helpers for storyboard ↔ generators. */

export const SCENE_IMAGE_HANDOFF_KEY = 'vyom-image-scene'
export const SCENE_ANIMATE_HANDOFF_KEY = 'vyom-animate-scene'
export const VOICEOVER_EXPORT_KEY = 'vyom-last-voiceover'
export const LAST_PROJECT_KEY = 'vyom-last-project-id'

export function writeLastProjectId(projectId) {
  if (!projectId) return
  try {
    sessionStorage.setItem(LAST_PROJECT_KEY, String(projectId))
  } catch {
    /* ignore */
  }
}

export function readLastProjectId() {
  try {
    return sessionStorage.getItem(LAST_PROJECT_KEY) || ''
  } catch {
    return ''
  }
}

export function normalizeScenes(raw) {
  return (raw || []).map((scene, i) => ({
    ...scene,
    id: scene.id || `scene-${Date.now()}-${i}`,
    scene_number: scene.scene_number ?? i + 1,
    status: scene.status || 'pending',
  }))
}

export function writeVoiceoverForExport(payload) {
  try {
    sessionStorage.setItem(VOICEOVER_EXPORT_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota errors */
  }
}

export function readVoiceoverForExport() {
  try {
    const raw = sessionStorage.getItem(VOICEOVER_EXPORT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function mediaPathForStorage(url) {
  if (!url) return ''
  const raw = String(url).trim()
  if (raw.startsWith('/api/storage/')) return raw
  if (raw.startsWith('/storage/')) return raw
  if (raw.includes('/storage/')) {
    const idx = raw.indexOf('/storage/')
    return raw.slice(idx)
  }
  if (raw.includes('/api/storage/')) {
    const idx = raw.indexOf('/api/storage/')
    return raw.slice(idx)
  }
  return raw
}

/** True when the path points at a locally saved, user-owned media file. */
export function isPersistedMediaPath(path) {
  if (!path) return false
  const p = String(path)
  return p.startsWith('/storage/') || p.includes('/api/storage/assets/')
}

export function sceneHasPrompts(scene) {
  return Boolean(scene?.image_prompt?.trim() && scene?.motion_prompt?.trim())
}

export function deriveSceneStatus(scene) {
  if (scene?.status === 'approved') return 'approved'
  if (scene?.video_url) return 'video_ready'
  if (scene?.image_url) return 'image_ready'
  if (sceneHasPrompts(scene)) return 'prompts_ready'
  return 'pending'
}

/** Full narrative text shown on storyboard cards (title + action). */
export function sceneNarrativeText(scene) {
  if (!scene) return ''
  const parts = [scene.brief_description, scene.detailed_action, scene.action].filter(Boolean)
  const unique = [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))]
  return unique.join(' ').trim()
}

/** AI-generated still-frame prompt (set via storyboard Generate prompts step). */
export function sceneImagePrompt(scene) {
  if (!scene) return ''
  return (scene.image_prompt || scene.prompt || '').trim()
}

export function sceneMotionPrompt(scene) {
  if (!scene) return ''
  return (scene.motion_prompt || '').trim()
}

export function readSceneHandoff(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeSceneHandoff(key, payload) {
  sessionStorage.setItem(key, JSON.stringify(payload))
}

export function clearSceneHandoff(key) {
  sessionStorage.removeItem(key)
}

/** Attach asset to Zustand scene; persist SQLite project when one is loaded. */
export async function attachSceneAssetAndMaybePersist(sceneId, updates, store) {
  store.attachSceneAsset(sceneId, updates)
  if (store.currentProject?.id) {
    return store.persistCurrentProject()
  }
  return { ok: false, reason: 'no_project' }
}
