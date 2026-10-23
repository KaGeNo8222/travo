import { AppError, ValidationError } from '@/utils/errors'
import type { I18n } from './index'

function errorName(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { name?: string; inner?: { name?: string } }
  return e.inner?.name ?? e.name
}

/** A user-facing message for any thrown value. */
export function errorMessage(err: unknown, i18n: I18n): string {
  if (err instanceof ValidationError) return i18n.tx(err.issues[0]?.message ?? 'error.validation')
  if (err instanceof AppError) return i18n.tx(err.message)
  const name = errorName(err)
  if (name === 'QuotaExceededError') return i18n.t('error.quota')
  if (name === 'ConstraintError') return i18n.t('error.duplicate')
  return i18n.t('error.unknown')
}

/** Inline field messages from a ValidationError, or null for other errors. */
export function fieldErrors(err: unknown, i18n: I18n): Record<string, string> | null {
  if (!(err instanceof ValidationError)) return null
  const out: Record<string, string> = {}
  for (const [field, key] of Object.entries(err.fieldErrors())) out[field] = i18n.tx(key)
  return out
}
