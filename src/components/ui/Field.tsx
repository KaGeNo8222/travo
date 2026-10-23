import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export const inputBase =
  'w-full rounded-xl border bg-surface-2 px-3.5 text-base text-fg placeholder:text-subtle transition-colors focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60'

interface FieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: ReactNode
  optional?: string
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, error, hint, optional, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-sm font-medium text-muted">
        {label}
        {optional && <span className="text-xs font-normal text-subtle">{optional}</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : (
        hint && <div className="text-[13px] text-subtle">{hint}</div>
      )}
    </div>
  )
}

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(inputBase, 'h-12', invalid ? 'border-danger' : 'border-line', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function TextArea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={3}
      className={cn(inputBase, 'min-h-24 py-3 leading-relaxed', invalid ? 'border-danger' : 'border-line', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  )
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(inputBase, 'h-12 appearance-none pr-10', invalid ? 'border-danger' : 'border-line', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  )
}

/** Two fields side by side on wider phones, stacked on very narrow ones. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">{children}</div>
}

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-primary after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
      {message}
    </p>
  )
}
