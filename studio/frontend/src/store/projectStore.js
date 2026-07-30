import { create } from 'zustand'
import { projectsApi } from '../api/client'
import { deriveSceneStatus, normalizeScenes, writeLastProjectId } from '../utils/sceneAssets'

const useProjectStore = create((set, get) => ({
  currentProject: null,
  projects: [],
  scenes: [],

  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),
  setScenes: (scenes) => set({ scenes }),

  loadProjectPayload: (project) => {
    if (project?.id) writeLastProjectId(project.id)
    set({
      currentProject: project,
      scenes: normalizeScenes(project?.scenes),
    })
  },

  clearProject: () => set({ currentProject: null, scenes: [] }),

  upsertProjectInList: (project) =>
    set((state) => {
      const list = state.projects || []
      const idx = list.findIndex((p) => p.id === project.id)
      if (idx === -1) return { projects: [project, ...list] }
      const next = [...list]
      next[idx] = { ...next[idx], ...project }
      return { projects: next }
    }),

  removeProjectFromList: (projectId) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
      scenes: state.currentProject?.id === projectId ? [] : state.scenes,
    })),

  addScene: (scene) => set((state) => ({ scenes: [...state.scenes, scene] })),
  updateScene: (sceneId, updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      ),
    })),
  deleteScene: (sceneId) =>
    set((state) => {
      const nextScenes = state.scenes.filter((scene) => scene.id !== sceneId)
      return {
        scenes: nextScenes,
        currentProject: state.currentProject
          ? { ...state.currentProject, scenes: nextScenes }
          : state.currentProject,
      }
    }),

  attachSceneAsset: (sceneId, updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene
        const merged = { ...scene, ...updates }
        return { ...merged, status: deriveSceneStatus(merged) }
      }),
    })),

  persistCurrentProject: async () => {
    const state = get()
    const project = state.currentProject
    if (!project?.id) {
      return { ok: false, reason: 'no_project' }
    }
    try {
      const res = await projectsApi.updateProject(project.id, {
        name: project.name,
        genre: project.genre,
        idea: project.idea || '',
        expanded_story: project.expanded_story || '',
        bible: project.bible || '',
        language: project.language || 'english',
        length: project.length || 'short',
        scenes: state.scenes,
      })
      const saved = res.data?.project
      if (saved) {
        set({
          currentProject: saved,
          scenes: saved.scenes || state.scenes,
        })
        get().upsertProjectInList(saved)
      }
      return { ok: true, project: saved }
    } catch (error) {
      return { ok: false, error }
    }
  },
}))

export default useProjectStore
