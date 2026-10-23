import { AppError } from '@/utils/errors'
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_INPUT_BYTES,
  isAllowedMimeType,
  isImageMimeType,
  resolveMimeType,
  sanitizeFilename,
} from '@/utils/files'
import type { NewFile } from './attachmentService'

export interface CompressOptions {
  /** Longest edge after resizing, in pixels. */
  maxDimension: number
  /** JPEG quality 0..1. */
  quality: number
  /** Images already within maxDimension and below this size are stored untouched. */
  keepBelowBytes: number
}

/** Product photos stay sharp enough to read labels and show to shop staff. */
export const PRODUCT_IMAGE: CompressOptions = { maxDimension: 1600, quality: 0.85, keepBelowBytes: 500 * 1024 }
export const COVER_IMAGE: CompressOptions = { maxDimension: 1920, quality: 0.8, keepBelowBytes: 500 * 1024 }

export interface ProcessedFile extends NewFile {
  originalSize: number
  compressed: boolean
  width?: number
  height?: number
}

export type UploadKind = 'image' | 'document'

interface FileLike {
  name?: string
  type: string
  size: number
}

/** Checks type and size; returns the resolved MIME type or throws an i18n-keyed AppError. */
export function validateUpload(file: FileLike, accept: UploadKind | 'any'): string {
  const mime = resolveMimeType(file)
  if (!mime || !isAllowedMimeType(mime)) throw new AppError('file_type', 'error.fileType')
  const image = isImageMimeType(mime)
  if (accept === 'image' && !image) throw new AppError('file_type', 'error.imageOnly')
  if (file.size === 0) throw new AppError('file_empty', 'error.fileEmpty')
  if (file.size > (image ? MAX_IMAGE_INPUT_BYTES : MAX_DOCUMENT_BYTES)) {
    throw new AppError('file_too_large', 'error.fileTooLarge')
  }
  return mime
}

/** Target size that keeps the aspect ratio and fits within maxDimension. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function replaceExtension(filename: string, ext: string): string {
  const base = filename.replace(/\.[^.]+$/, '') || 'image'
  return `${base}.${ext}`
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    // <img> applies EXIF orientation, which keeps iPhone photos the right way up.
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Resizes and re-encodes a photo as JPEG to save storage. Small images, and anything that
 * would not get smaller, are kept as the original file.
 */
export async function processImage(file: Blob & { name?: string }, options: CompressOptions): Promise<ProcessedFile> {
  const mimeType = validateUpload({ name: file.name, type: file.type, size: file.size }, 'image')
  const filename = sanitizeFilename(file.name ?? '', `image-${Date.now()}.jpg`)
  const original: ProcessedFile = {
    blob: file,
    filename,
    mimeType,
    size: file.size,
    originalSize: file.size,
    compressed: false,
  }

  let img: HTMLImageElement
  try {
    img = await decodeImage(file)
  } catch {
    throw new AppError('image_decode', 'error.imageDecode')
  }
  const width = img.naturalWidth
  const height = img.naturalHeight
  const target = fitWithin(width, height, options.maxDimension)
  const needsResize = target.width < width || target.height < height
  const browserSafe = mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp'
  // Animated GIFs would lose their animation, so small ones are kept as-is.
  if (!needsResize && file.size <= options.keepBelowBytes && (browserSafe || mimeType === 'image/gif')) {
    return { ...original, width, height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AppError('image_encode', 'error.imageEncode')
  ctx.fillStyle = '#ffffff' // JPEG has no alpha; flatten transparent PNGs onto white
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, target.width, target.height)
  const blob = await canvasToBlob(canvas, 'image/jpeg', options.quality)
  canvas.width = 0
  canvas.height = 0
  if (!blob) throw new AppError('image_encode', 'error.imageEncode')

  if (!needsResize && browserSafe && blob.size >= file.size) return { ...original, width, height }
  return {
    blob,
    filename: replaceExtension(filename, 'jpg'),
    mimeType: 'image/jpeg',
    size: blob.size,
    originalSize: file.size,
    compressed: true,
    width: target.width,
    height: target.height,
  }
}

/** Travel documents are stored exactly as provided — never re-encoded. */
export function prepareDocument(file: Blob & { name?: string }): ProcessedFile {
  const mimeType = validateUpload({ name: file.name, type: file.type, size: file.size }, 'any')
  return {
    blob: file,
    filename: sanitizeFilename(file.name ?? '', `document-${Date.now()}`),
    mimeType,
    size: file.size,
    originalSize: file.size,
    compressed: false,
  }
}

/** Reads an image from the clipboard. Requires a user gesture; support varies on iOS. */
export async function readClipboardImage(): Promise<File | null> {
  const clip = navigator.clipboard as Clipboard | undefined
  if (!clip || typeof clip.read !== 'function') throw new AppError('clipboard', 'error.clipboardUnsupported')
  let items: ClipboardItems
  try {
    items = await clip.read()
  } catch {
    throw new AppError('clipboard', 'error.clipboardDenied')
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) {
      const blob = await item.getType(type)
      const ext = type.split('/')[1] ?? 'png'
      return new File([blob], `pasted-${Date.now()}.${ext}`, { type })
    }
  }
  return null
}

export function isClipboardReadSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
}
