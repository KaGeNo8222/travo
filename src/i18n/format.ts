import { formatInTimeZone } from 'date-fns-tz'
import { currencyDigits } from '@/utils/money'
import { splitLocalDateTime } from '@/utils/time'

// Locale-aware formatting. Calendar dates are formatted in UTC so a "YYYY-MM-DD" string is
// never shifted by the device's own time zone.

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>()

function dtf(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`
  let f = cache.get(key) as Intl.DateTimeFormat | undefined
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options)
    cache.set(key, f)
  }
  return f
}

function nf(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`
  let f = cache.get(key) as Intl.NumberFormat | undefined
  if (!f) {
    f = new Intl.NumberFormat(locale, options)
    cache.set(key, f)
  }
  return f
}

const asUtcDate = (date: string) => new Date(`${date}T00:00:00Z`)

export type DateStyle = 'short' | 'medium' | 'long' | 'weekday' | 'weekdayShort' | 'dayMonth'

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'short', day: 'numeric', month: 'short' },
  weekdayShort: { weekday: 'short' },
  dayMonth: { day: 'numeric', month: 'short' },
}

export function formatDate(date: string, locale: string, style: DateStyle = 'medium'): string {
  return dtf(locale, { ...DATE_OPTIONS[style], timeZone: 'UTC' }).format(asUtcDate(date))
}

export function formatDateRange(start: string, end: string, locale: string): string {
  const f = dtf(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (start === end) return f.format(asUtcDate(start))
  try {
    return f.formatRange(asUtcDate(start), asUtcDate(end))
  } catch {
    return `${f.format(asUtcDate(start))} – ${f.format(asUtcDate(end))}`
  }
}

/** "YYYY-MM-DDTHH:mm" shown as date + time exactly as written (local to its place). */
export function formatLocalDateTime(value: string, locale: string): { date: string; time: string } {
  const { date, time } = splitLocalDateTime(value)
  return { date: formatDate(date, locale, 'weekday'), time }
}

/** An instant shown in a given time zone. */
export function formatInstant(date: Date, tz: string, locale: string, withDate = false): string {
  return dtf(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(withDate ? { day: 'numeric', month: 'short' } : {}),
  }).format(date)
}

export function formatClock(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'HH:mm')
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 2): string {
  return nf(locale, { maximumFractionDigits }).format(value)
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency)
  try {
    return nf(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    return `${formatNumber(amount, locale, digits)} ${currency}`
  }
}

export function formatRate(rate: number, locale: string): string {
  return nf(locale, { maximumFractionDigits: 6 }).format(rate)
}
