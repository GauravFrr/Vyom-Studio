import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import MediaLibrary from './pages/MediaLibrary'
import StoryEditor from './pages/StoryEditor'
import Storyboard from './pages/Storyboard'
import ImageGenerator from './pages/ImageGenerator'
import VideoGenerator from './pages/VideoGenerator'
import Voiceover from './pages/Voiceover'
import ScenePromptStudio from './pages/ScenePromptStudio'
import ExportPage from './pages/ExportPage'
import AssetLibrary from './pages/AssetLibrary'
import Settings from './pages/Settings'
import InstaPvtHub from './pages/insta/InstaPvtHub'
import InstaPvtTransform from './pages/insta/InstaPvtTransform'
import InstaPvtTransformVideo from './pages/insta/InstaPvtTransformVideo'
import InstaFaceImage from './pages/insta/InstaFaceImage'
import InstaFaceVideo from './pages/insta/InstaFaceVideo'
import { LoginPage, RegisterPage, VerifyEmailPage } from './pages/Auth'
import ProtectedRoute from './components/ProtectedRoute'
import useDisplaySettings from './hooks/useDisplaySettings'
import { useToast } from './components/ui/Toast'

/**
 * Listens globally for the `vyom:provider-fallback` event (fired by
 * `api/client.js#notifyProviderFallback` when a story call silently
 * switched providers) and pops an info toast. Lives at the App level
 * so the toast appears no matter which page the user is on.
 */
function GlobalProviderFallbackListener() {
  const toast = useToast()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onFallback = (e) => {
      const detail = e.detail || {}
      toast({
        kind: 'info',
        title: 'Provider switched',
        message: detail.message || `Used ${detail.provider || 'an alternative provider'} for this request.`,
        duration: 6000,
      })
    }
    window.addEventListener('vyom:provider-fallback', onFallback)
    return () => window.removeEventListener('vyom:provider-fallback', onFallback)
  }, [toast])
  return null
}

function App() {
  // Apply Settings → Display preferences globally (density, font scale,
  // reduce motion, color-blind-safe palette). Re-runs on any change.
  useDisplaySettings()

  return (
    <Router>
      <GlobalProviderFallbackListener />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/"                element={<Dashboard />} />
          <Route path="/projects"        element={<Projects />} />
          <Route path="/media"           element={<MediaLibrary />} />
          <Route path="/story-editor"    element={<StoryEditor />} />
          <Route path="/storyboard"      element={<Storyboard />} />
          <Route path="/scene-prompts"   element={<ScenePromptStudio />} />
          <Route path="/image-generator" element={<ImageGenerator />} />
          <Route path="/video-generator" element={<VideoGenerator />} />
          <Route path="/voiceover"       element={<Voiceover />} />
          <Route path="/export"          element={<ExportPage />} />
          <Route path="/assets"          element={<AssetLibrary />} />
          <Route path="/insta-pvt"              element={<InstaPvtHub />} />
          <Route path="/insta-pvt/transform"        element={<InstaPvtTransform />} />
          <Route path="/insta-pvt/transform-video"  element={<InstaPvtTransformVideo />} />
          <Route path="/insta-pvt/face-image"   element={<InstaFaceImage />} />
          <Route path="/insta-pvt/face-video"   element={<InstaFaceVideo />} />
          <Route path="/settings"        element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
