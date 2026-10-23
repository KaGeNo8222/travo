import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useViewport'
import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'
import { Button } from './Button'

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

/** Fills the visual viewport so sheets stay above the iOS keyboard. */
const viewportStyle = { top: 'var(--vv-top, 0px)', height: 'var(--vv-height, 100dvh)' }

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Right side of the header — usually the Save button. */
  action?: ReactNode
  footer?: ReactNode
  size?: 'full' | 'auto'
}

/** iOS-style modal sheet: Cancel on the left, title, primary action on the right. */
export function Sheet({ open, onClose, title, children, action, footer, size = 'full' }: SheetProps) {
  const { t } = useI18n()
  const titleId = useId()
  useBodyScrollLock(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-x-0 z-50 flex flex-col justify-end" style={viewportStyle}>
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative mx-auto flex w-full max-w-xl animate-slide-up flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl',
          size === 'full' ? 'h-[calc(100%-max(env(safe-area-inset-top),16px)-8px)]' : 'max-h-[90%]',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 min-w-18 rounded-full px-3 text-left text-[15px] text-primary active:bg-primary-soft"
          >
            {t('common.cancel')}
          </button>
          <h2 id={titleId} className="flex-1 truncate text-center text-[17px] font-semibold">
            {title}
          </h2>
          <div className="flex min-w-18 justify-end">{action}</div>
        </div>
        <div
          className={cn(
            'flex-1 overflow-y-auto overscroll-contain px-4 pt-5',
            footer ? 'pb-5' : 'pb-[calc(env(safe-area-inset-bottom)+24px)]',
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Thumb-reachable footer button that submits the form with id `form`. */
export function SheetSubmit({ form, label, loading }: { form: string; label: string; loading?: boolean }) {
  return (
    <Button type="submit" form={form} block size="lg" loading={loading}>
      {label}
    </Button>
  )
}

export interface ActionItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

/** Bottom action menu for item actions (edit, duplicate, delete …). */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean
  onClose: () => void
  title?: string
  actions: ActionItem[]
}) {
  const { t } = useI18n()
  useBodyScrollLock(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-x-0 z-50 flex flex-col justify-end px-2" style={viewportStyle}>
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="menu"
        className="relative mx-auto mb-[max(env(safe-area-inset-bottom),8px)] flex w-full max-w-xl animate-slide-up flex-col gap-2"
      >
        <div className="max-h-[70dvh] overflow-y-auto rounded-2xl bg-surface">
          {title && <p className="border-b border-line px-4 py-3 text-center text-[13px] text-muted">{title}</p>}
          {actions.map((action, i) => {
            const Icon = action.icon
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  onClose()
                  action.onSelect()
                }}
                className={cn(
                  'flex h-14 w-full items-center gap-3 border-b border-line px-4 text-left text-[16px] last:border-b-0 active:bg-surface-2 disabled:opacity-40',
                  action.tone === 'danger' ? 'text-danger' : 'text-fg',
                )}
              >
                {Icon && <Icon className="size-5 shrink-0 opacity-80" aria-hidden />}
                <span className="truncate">{action.label}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-14 w-full rounded-2xl bg-surface text-[16px] font-semibold text-primary active:bg-surface-2"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
