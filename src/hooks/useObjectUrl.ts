import { useEffect, useState } from 'react'
import { useAttachment } from './useData'

/**
 * Object URL for a Blob, revoked when the blob changes or the component unmounts.
 * Pass a stable `key` (e.g. the attachment id) when the same content may arrive as a new
 * Blob instance on every query.
 */
export function useObjectUrl(blob: Blob | null | undefined, key?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const dep = key ?? blob
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
    // Keyed by `dep` on purpose: a new Blob instance with the same key keeps the old URL.
  }, [dep])
  return url
}

/** Object URL for a stored attachment. Attachments are immutable, so the id is a stable key. */
export function useAttachmentUrl(id: string | null | undefined): { url: string | null; missing: boolean } {
  const attachment = useAttachment(id)
  const url = useObjectUrl(attachment?.blob, attachment?.id)
  return { url, missing: !!id && attachment === null }
}
