import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, LoaderCircle, Minus, Plus, Search, X, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...rest}>
      {children}
    </div>
  )
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: BadgeTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', BADGE_TONES[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-6 animate-spin text-subtle', className)} aria-hidden />
}

export function PageLoader() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status" aria-label={t('common.loading')}>
      <Spinner />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, message, children }: { icon: LucideIcon; title: string; message?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-8" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message && <p className="mt-1.5 max-w-xs text-[15px] leading-relaxed text-muted">{message}</p>}
      {children && <div className="mt-6 flex w-full max-w-xs flex-col gap-2">{children}</div>}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-sm font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Horizontally scrolling filter chips. */
export function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<SegmentOption<T> & { count?: number }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-fg active:bg-surface-2',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="text-xs opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t } = useI18n()
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border-0 bg-surface-2 pr-10 pl-10 text-base text-fg placeholder:text-subtle focus:ring-2 focus:ring-primary/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-subtle active:bg-line"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
}) {
  const { t } = useI18n()
  return (
    <div className="flex h-12 items-center justify-between rounded-xl border border-line bg-surface-2 px-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={t('common.decrease')}
        className="flex size-10 items-center justify-center rounded-lg text-primary active:bg-line disabled:opacity-30"
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <span className="min-w-10 text-center text-lg font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={t('common.increase')}
        className="flex size-10 items-center justify-center rounded-lg text-primary active:bg-line disabled:opacity-30"
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  )
}

export function ProgressBar({ value, tone = 'primary', label }: { value: number; tone?: 'primary' | 'success' | 'danger'; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', tone === 'danger' ? 'bg-danger' : tone === 'success' ? 'bg-success' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-2 px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  )
}

/** Floating "add" button kept within thumb reach, above the bottom navigation. */
export function Fab({ label, onClick, icon: Icon = Plus }: { label: string; onClick: () => void; icon?: LucideIcon }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-20 mx-auto flex max-w-xl justify-end px-4">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-primary pr-5 pl-4 text-[15px] font-semibold text-primary-fg shadow-lg shadow-black/15 active:opacity-85"
      >
        <Icon className="size-6" aria-hidden />
        {label}
      </button>
    </div>
  )
}

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('divide-y divide-line overflow-hidden', className)}>{children}</Card>
}

interface ListRowProps {
  icon?: LucideIcon
  label: string
  value?: ReactNode
  description?: string
  to?: string
  onClick?: () => void
  tone?: 'default' | 'danger'
  chevron?: boolean
}

export function ListRow({ icon: Icon, label, value, description, to, onClick, tone = 'default', chevron }: ListRowProps) {
  const content = (
    <>
      {Icon && (
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary')}>
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[16px]', tone === 'danger' && 'text-danger')}>{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-right text-[15px] text-muted">{value}</span>}
      {(chevron ?? !!(to || onClick)) && <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left'
  if (to) {
    return (
      <Link to={to} className={cn(cls, 'active:bg-surface-2')}>
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'active:bg-surface-2')}>
        {content}
      </button>
    )
  }
  return <div className={cls}>{content}</div>
}
