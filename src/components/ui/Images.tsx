import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ClipboardPaste, ImageOff, Images, LoaderCircle, Trash2, X, type LucideIcon } from 'lucide-react'
import { useAttachmentUrl, useObjectUrl } from '@/hooks/useObjectUrl'
import { useBodyScrollLock } from '@/hooks/useViewport'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import type { ImageChange } from '@/services/attachmentService'
import { isClipboardReadSupported, processImage, readClipboardImage, type CompressOptions, type ProcessedFile } from '@/services/imageService'
import { cn } from '@/utils/cn'
import { formatBytes } from '@/utils/files'

function Placeholder({ icon: Icon = ImageOff, className }: { icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-surface-2 text-subtle', className)}>
      <Icon className="size-1/4 max-h-10 max-w-10 min-h-5 min-w-5" aria-hidden />
    </div>
  )
}

function StoredImage({ id, alt, className, fallbackIcon }: { id: string; alt: string; className?: string; fallbackIcon?: LucideIcon }) {
  const { url, missing } = useAttachmentUrl(id)
  const [failed, setFailed] = useState(false)
  if (missing || failed) return <Placeholder icon={fallbackIcon} className={className} />
  if (!url) return <div className={cn('animate-pulse bg-surface-2', className)} />
  return <img src={url} alt={alt} className={cn('object-cover', className)} onError={() => setFailed(true)} draggable={false} />
}

/** An image stored in IndexedDB, with a placeholder when missing or unreadable. */
export function AttachmentImage({ id, alt, className, fallbackIcon }: { id?: string | null; alt: string; className?: string; fallbackIcon?: LucideIcon }) {
  if (!id) return <Placeholder icon={fallbackIcon} className={className} />
  return <StoredImage key={id} id={id} alt={alt} className={className} fallbackIcon={fallbackIcon} />
}

/** Full-screen image — large enough to show a product to shop staff. */
export function ImageViewer({ id, caption, subcaption, onClose }: { id: string | null; caption?: string; subcaption?: string; onClose: () => void }) {
  const { t } = useI18n()
  const { url } = useAttachmentUrl(id)
  useBodyScrollLock(!!id)
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])
  if (!id) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={caption}>
      <div className="flex shrink-0 justify-end px-2 pt-[max(env(safe-area-inset-top),8px)]">
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex size-11 items-center justify-center rounded-full bg-white/15 active:bg-white/25">
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={onClose}>
        {url ? <img src={url} alt={caption ?? ''} className="max-h-full max-w-full rounded-lg object-contain" /> : <LoaderCircle className="size-8 animate-spin" />}
      </div>
      {caption && (
        <div className="shrink-0 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] text-center">
          <p className="text-2xl font-bold">{caption}</p>
          {subcaption && <p className="mt-1 text-lg text-white/75">{subcaption}</p>}
        </div>
      )}
    </div>,
    document.body,
  )
}

export type ImageValue = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; file: ProcessedFile }

export function imageValueFrom(id: string | null | undefined): ImageValue {
  return id ? { kind: 'existing', id } : { kind: 'none' }
}

export function toImageChange(initialId: string | null | undefined, value: ImageValue): ImageChange {
  if (value.kind === 'new') return { kind: 'replace', file: value.file }
  if (value.kind === 'none') return initialId ? { kind: 'remove' } : { kind: 'keep' }
  return { kind: 'keep' }
}

function NewImagePreview({ file, className }: { file: ProcessedFile; className?: string }) {
  const url = useObjectUrl(file.blob)
  return url ? <img src={url} alt="" className={cn('object-cover', className)} /> : <div className={cn('bg-surface-2', className)} />
}

interface ImagePickerProps {
  value: ImageValue
  onChange: (value: ImageValue) => void
  options: CompressOptions
  aspect?: 'square' | 'wide'
}

/**
 * Picks an image from the camera, the photo library / files, or the clipboard, compresses it
 * and shows a preview. Nothing is stored until the surrounding form is saved.
 */
export function ImagePicker({ value, onChange, options, aspect = 'square' }: ImagePickerProps) {
  const i18n = useI18n()
  const { t } = i18n
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canPaste = isClipboardReadSupported()

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange({ kind: 'new', file: await processImage(file, options) })
    } catch (err) {
      setError(errorMessage(err, i18n))
    } finally {
      setBusy(false)
    }
  }

  // Desktop and some iPad keyboards paste straight into the page.
  const handleFileRef = useRef(handleFile)
  handleFileRef.current = handleFile
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        void handleFileRef.current(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const paste = async () => {
    setError(null)
    try {
      const file = await readClipboardImage()
      if (file) await handleFile(file)
      else setError(t('image.noClipboardImage'))
    } catch (err) {
      setError(errorMessage(err, i18n))
    }
  }

  const frame = cn('w-full overflow-hidden rounded-2xl', aspect === 'square' ? 'aspect-square max-w-60' : 'aspect-[16/9]')
  const sourceButton = 'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-2 text-sm font-medium text-fg active:bg-line disabled:opacity-40'

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('relative', frame)}>
        {value.kind === 'new' ? (
          <NewImagePreview file={value.file} className="size-full" />
        ) : value.kind === 'existing' ? (
          <AttachmentImage id={value.id} alt="" className="size-full" />
        ) : (
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 border-2 border-dashed border-line bg-surface-2 text-sm text-muted active:bg-line"
          >
            <Images className="size-8" aria-hidden />
            {t('image.add')}
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <LoaderCircle className="size-8 animate-spin text-white" aria-label={t('image.processing')} />
          </div>
        )}
        {value.kind !== 'none' && !busy && (
          <button
            type="button"
            onClick={() => onChange({ kind: 'none' })}
            aria-label={t('image.remove')}
            className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full bg-black/55 text-white active:bg-black/70"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {value.kind === 'new' && (
        <p className="text-[13px] text-muted">
          {value.file.compressed
            ? t('image.compressed', { from: formatBytes(value.file.originalSize), to: formatBytes(value.file.size) })
            : t('image.size', { size: formatBytes(value.file.size) })}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className={sourceButton} onClick={() => cameraRef.current?.click()} disabled={busy}>
          <Camera className="size-[18px]" aria-hidden />
          {t('image.camera')}
        </button>
        <button type="button" className={sourceButton} onClick={() => libraryRef.current?.click()} disabled={busy}>
          <Images className="size-[18px]" aria-hidden />
          {t('image.library')}
        </button>
        {canPaste && (
          <button type="button" className={sourceButton} onClick={paste} disabled={busy}>
            <ClipboardPaste className="size-[18px]" aria-hidden />
            {t('image.paste')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
