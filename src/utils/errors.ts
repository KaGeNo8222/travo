// Error messages are i18n keys so the UI can translate them.

export class AppError extends Error {
  readonly code: string
  constructor(code: string, message: string = code) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export interface FieldIssue {
  /** Dotted field path, e.g. "endDate". Empty for object-level issues. */
  path: string
  /** i18n key such as "v.required". */
  message: string
}

export class ValidationError extends AppError {
  readonly issues: FieldIssue[]
  constructor(issues: FieldIssue[]) {
    super('validation', issues[0]?.message ?? 'error.validation')
    this.name = 'ValidationError'
    this.issues = issues
  }

  /** First message per field, for showing inline form errors. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const issue of this.issues) {
      const key = issue.path || '_form'
      out[key] ??= issue.message
    }
    return out
  }
}

export class NotFoundError extends AppError {
  readonly entity: string
  constructor(entity: string) {
    super('not_found', 'error.notFound')
    this.name = 'NotFoundError'
    this.entity = entity
  }
}

/** A reference points to a record that is missing or belongs to another trip. */
export class IntegrityError extends AppError {
  constructor(message: string) {
    super('integrity', message)
    this.name = 'IntegrityError'
  }
}

export interface DayConflict {
  dayId: string
  date: string
  activityCount: number
  hasNotes: boolean
}

/** Changing trip dates would remove days that still hold activities or notes. */
export class DateChangeConflictError extends AppError {
  readonly conflicts: DayConflict[]
  constructor(conflicts: DayConflict[]) {
    super('date_conflict', 'error.dateConflict')
    this.name = 'DateChangeConflictError'
    this.conflicts = conflicts
  }
}

export class BackupError extends AppError {
  readonly details: string[]
  constructor(message: string, details: string[] = []) {
    super('backup', message)
    this.name = 'BackupError'
    this.details = details
  }
}
