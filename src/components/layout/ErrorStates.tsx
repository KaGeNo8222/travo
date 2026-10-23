import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Compass, TriangleAlert } from 'lucide-react'
import { createI18n, useI18n } from '@/i18n'
import { readLocal } from '@/utils/storage'
import { buttonClass } from '../ui/Button'
import { EmptyState } from '../ui/Primitives'

function Fallback({ title, message, detail }: { title: string; message: string; detail?: string }) {
  const { t } = createI18n(readLocal('travo:lang') === 'en' ? 'en' : 'th')
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-fg">
      <TriangleAlert className="size-10 text-warning" aria-hidden />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-muted">{message}</p>
      {detail && <pre className="max-w-sm overflow-x-auto rounded-xl bg-surface-2 p-3 text-left text-xs whitespace-pre-wrap text-muted">{detail}</pre>}
      <button type="button" className={buttonClass({})} onClick={() => window.location.reload()}>
        {t('error.reload')}
      </button>
    </div>
  )
}

/** Last-resort boundary, e.g. when IndexedDB cannot be opened at all. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TRAVO crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const { t } = createI18n(readLocal('travo:lang') === 'en' ? 'en' : 'th')
    const dbError = /indexeddb|database|dexie/i.test(`${this.state.error.name} ${this.state.error.message}`)
    return (
      <Fallback
        title={t('error.crashTitle')}
        message={dbError ? t('error.databaseUnavailable') : t('error.crashMessage')}
        detail={`${this.state.error.name}: ${this.state.error.message}`}
      />
    )
  }
}

/** Route-level error element. */
export function RouteError() {
  const error = useRouteError()
  const { t } = useI18n()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : undefined
  return <Fallback title={t('error.crashTitle')} message={t('error.crashMessage')} detail={detail} />
}

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="pt-safe">
      <EmptyState icon={Compass} title={t('error.notFoundTitle')} message={t('error.notFoundMessage')}>
        <Link to="/trips" className={buttonClass({ block: true })}>
          {t('trips.title')}
        </Link>
      </EmptyState>
    </div>
  )
}
