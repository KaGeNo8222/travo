export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const
export const DOCUMENT_MIME_TYPES = ['application/pdf'] as const

/** Largest image accepted from the picker (before compression). */
export const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024
/** Largest document stored unmodified (PDF tickets, booking confirmations). */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
/** Hard cap for any stored attachment. */
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024

const ALLOWED = new Set<string>([...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES])

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED.has(mime)
}

export function isImageMimeType(mime: string): boolean {
  return mime.startsWith('image/')
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

/** Some iOS file sources report an empty type; fall back to the file extension. */
export function resolveMimeType(file: { name?: string; type: string }): string {
  if (file.type) return file.type.toLowerCase()
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? ''
}

export function formatBytes(bytes: number, locale = 'en-US'): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)
  return `${formatted} ${units[i]}`
}

export function sanitizeFilename(name: string, fallback = 'file'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120)
  return cleaned || fallback
}

/**
 * Hands a file to the user: the share sheet where available (lets iPhone users pick
 * "Save to Files" / iCloud Drive), otherwise a regular download. Must run from a tap.
 */
export async function shareOrDownloadFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Fall through to a download when sharing is refused.
    }
  }
  downloadFile(file)
  return 'downloaded'
}

export function downloadFile(file: Blob, filename = file instanceof File ? file.name : 'download'): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
