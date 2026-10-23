import type { z } from 'zod'
import { ValidationError } from '@/utils/errors'

/** Parses `data` with `schema`; throws a ValidationError carrying i18n message keys. */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  throw new ValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message.startsWith('v.') ? issue.message : 'v.invalid',
    })),
  )
}
