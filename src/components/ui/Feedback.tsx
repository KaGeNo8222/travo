import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useUiStore, type Toast } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

/** Renders the dialog queue from askDialog() / useConfirm(). */
export function DialogHost() {
  const dialog = useUiStore((s) => s.dialogs[0])
  const closeDialog = useUiStore((s) => s.closeDialog)
  if (!dialog) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/45" onClick={() => closeDialog(dialog.id, null)} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dialog-${dialog.id}`}
        className="relative w-full max-w-sm animate-pop-in overflow-hidden rounded-3xl bg-surface shadow-2xl"
      >
        <div className="px-5 pt-5 pb-4 text-center">
          <h2 id={`dialog-${dialog.id}`} className="text-[17px] font-semibold">
            {dialog.title}
          </h2>
          {dialog.message && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-muted">{dialog.message}</p>}
          {dialog.details && dialog.details.length > 0 && (
            <ul className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-surface-2 px-3 py-2 text-left text-[13px] text-muted">
              {dialog.details.map((d, i) => (
                <li key={i} className="py-0.5">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col border-t border-line">
          {dialog.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => closeDialog(dialog.id, action.id)}
              className={cn(
                'h-13 border-b border-line text-[16px] active:bg-surface-2',
                action.tone === 'danger' ? 'font-semibold text-danger' : 'font-semibold text-primary',
              )}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => closeDialog(dialog.id, null)}
            className="h-13 text-[16px] text-muted active:bg-surface-2"
          >
            {dialog.cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast)
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), toast.action ? 5000 : 3000)
    return () => window.clearTimeout(id)
  }, [toast, dismiss])
  const Icon = toast.tone === 'error' ? TriangleAlert : toast.tone === 'success' ? CircleCheck : null
  return (
    <div
      role="status"
      className="pointer-events-auto flex min-h-12 w-full animate-slide-up items-center gap-3 rounded-2xl bg-fg px-4 py-2.5 text-[15px] text-bg shadow-lg"
    >
      {Icon && <Icon className={cn('size-5 shrink-0', toast.tone === 'error' ? 'text-danger' : 'text-success')} aria-hidden />}
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="h-9 shrink-0 rounded-lg px-2 font-semibold text-primary-soft active:opacity-70"
          onClick={() => {
            toast.action!.onClick()
            dismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[70] mx-auto flex max-w-xl flex-col gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  )
}
