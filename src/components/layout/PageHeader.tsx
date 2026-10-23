import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { useI18n } from '@/i18n'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Path to go back to; shows a back button. */
  back?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 bg-bg/88 pt-safe backdrop-blur-xl backdrop-saturate-150">
      <div className="flex min-h-14 items-center gap-1 px-2">
        {back ? (
          <button
            type="button"
            onClick={() => navigate(back)}
            aria-label={t('common.back')}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary active:bg-primary-soft"
          >
            <ChevronLeft className="size-7" aria-hidden />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 py-1.5">
          <h1 className="truncate text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center">{actions}</div>}
      </div>
    </header>
  )
}

/** Standard page body: side gutters and room for the bottom navigation. */
export function PageBody({ children, withFab }: { children: ReactNode; withFab?: boolean }) {
  return <div className={withFab ? 'px-4 pt-2 pb-28' : 'px-4 pt-2 pb-8'}>{children}</div>
}
