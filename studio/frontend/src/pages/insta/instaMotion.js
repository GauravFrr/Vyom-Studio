import { SMOOTH_EASE, gridItemVariants } from '../../hooks/useHomeIntro'

export const pageStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: SMOOTH_EASE },
  },
}

export const revealVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.55, ease: SMOOTH_EASE },
  },
}

export { gridItemVariants, SMOOTH_EASE }

export function readImageFile(file, toast) {
  if (!file || !file.type.startsWith('image/')) {
    toast?.({ kind: 'error', title: 'Invalid file', message: 'Please upload PNG, JPG, or WebP.' })
    return null
  }
  if (file.size > 10 * 1024 * 1024) {
    toast?.({ kind: 'error', title: 'File too large', message: 'Max 10MB for images.' })
    return null
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsDataURL(file)
  })
}

export function readVideoFile(file, toast) {
  if (!file || !file.type.startsWith('video/')) {
    toast?.({ kind: 'error', title: 'Invalid file', message: 'Please upload MP4 or WebM.' })
    return null
  }
  if (file.size > 40 * 1024 * 1024) {
    toast?.({ kind: 'error', title: 'File too large', message: 'Max 40MB for reference video.' })
    return null
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsDataURL(file)
  })
}
