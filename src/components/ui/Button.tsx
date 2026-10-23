import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg active:opacity-85',
  secondary: 'bg-surface-2 text-fg active:bg-line',
  ghost: 'text-primary active:bg-primary-soft',
  danger: 'bg-danger-soft text-danger active:opacity-80',
  outline: 'border border-line bg-surface text-fg active:bg-surface-2',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-lg px-3 text-sm',
  md: 'h-11 gap-2 rounded-xl px-4 text-[15px]',
  lg: 'h-13 gap-2 rounded-2xl px-5 text-base',
}

const ICON_SIZES: Record<ButtonSize, string> = { sm: 'size-4', md: 'size-[18px]', lg: 'size-5' }

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: LucideIcon
}

export function buttonClass({ variant = 'primary', size = 'md', block }: StyleProps, className?: string): string {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center font-semibold transition-[opacity,background-color] disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean
}

export function Button({ variant, size = 'md', block, icon: Icon, loading, className, children, type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass({ variant, size, block }, className)} {...rest}>
      {loading ? (
        <LoaderCircle className={cn(ICON_SIZES[size], 'animate-spin')} aria-hidden />
      ) : (
        Icon && <Icon className={ICON_SIZES[size]} aria-hidden />
      )}
      {children}
    </button>
  )
}

export function LinkButton({ variant, size = 'md', block, icon: Icon, className, children, ...rest }: LinkProps & StyleProps) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      {Icon && <Icon className={ICON_SIZES[size]} aria-hidden />}
      {children}
    </Link>
  )
}

/** Opens an external site (e.g. Google Maps) in a new context; iOS hands Maps links to the app. */
export function ExternalLinkButton({ variant, size = 'md', block, icon: Icon, className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & StyleProps) {
  return (
    <a target="_blank" rel="noopener noreferrer" className={buttonClass({ variant, size, block }, className)} {...rest}>
      {Icon && <Icon className={ICON_SIZES[size]} aria-hidden />}
      {children}
    </a>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger'
  size?: 'sm' | 'md'
}

const ICON_BUTTON_VARIANTS = {
  ghost: 'text-fg active:bg-surface-2',
  secondary: 'bg-surface-2 text-fg active:bg-line',
  primary: 'bg-primary text-primary-fg active:opacity-85',
  danger: 'text-danger active:bg-danger-soft',
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        size === 'md' ? 'size-11' : 'size-9',
        ICON_BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'md' ? 'size-[22px]' : 'size-[18px]'} aria-hidden />
    </button>
  )
}
