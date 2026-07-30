import { useEffect, useState } from 'react'
import apiClient, { resolveMediaUrl } from '../api/client'

function isPublicMediaUrl(url) {
  if (!url) return true
  const u = String(url)
  if (u.startsWith('data:') || u.startsWith('blob:')) return true
  if (/^https?:\/\//i.test(u)) return true
  if (u.includes('sig=')) return true
  return false
}

function authMediaPath(url) {
  const resolved = resolveMediaUrl(url)
  if (resolved.startsWith('/api/')) return resolved
  return `/api${resolved.startsWith('/') ? '' : '/'}${resolved}`
}

function useSecureBlobUrl(src) {
  const [blobUrl, setBlobUrl] = useState('')

  useEffect(() => {
    if (!src) {
      setBlobUrl('')
      return undefined
    }
    const resolved = resolveMediaUrl(src)
    if (isPublicMediaUrl(src)) {
      setBlobUrl(resolved)
      return undefined
    }

    let cancelled = false
    let objectUrl = ''
    apiClient
      .get(authMediaPath(src), { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setBlobUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setBlobUrl('')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  return blobUrl
}

export function SecureImage({ src, alt = '', className, ...props }) {
  const blobUrl = useSecureBlobUrl(src)
  if (!blobUrl) {
    return <div className={className} aria-hidden {...props} />
  }
  return <img src={blobUrl} alt={alt} className={className} {...props} />
}

export function SecureVideo({ src, className, controls = true, ...props }) {
  const blobUrl = useSecureBlobUrl(src)
  if (!blobUrl) {
    return <div className={className} aria-hidden {...props} />
  }
  return <video src={blobUrl} className={className} controls={controls} {...props} />
}

export function SecureAudio({ src, className, controls = true, ...props }) {
  const blobUrl = useSecureBlobUrl(src)
  if (!blobUrl) {
    return <div className={className} aria-hidden {...props} />
  }
  return <audio src={blobUrl} className={className} controls={controls} {...props} />
}
