import { useCallback } from 'react'
import { useI18n } from '@/i18n'
import { askDialog } from '@/stores/uiStore'

export interface ConfirmOptions {
  title: string
  message?: string
  details?: string[]
  confirmLabel?: string
  danger?: boolean
}

/** Promise-based confirmation dialog. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const { t } = useI18n()
  return useCallback(
    async ({ title, message, details, confirmLabel, danger }: ConfirmOptions) =>
      (await askDialog({
        title,
        message,
        details,
        cancelLabel: t('common.cancel'),
        actions: [{ id: 'ok', label: confirmLabel ?? t('common.confirm'), tone: danger ? 'danger' : 'primary' }],
      })) === 'ok',
    [t],
  )
}
