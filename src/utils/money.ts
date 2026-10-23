// Money arithmetic in integer minor units to avoid floating-point drift.
//
// Rounding rules:
// 1. Amounts are rounded half-up (away from zero) to the currency's minor unit
//    (THB 2 decimals, JPY 0, ...) when stored.
// 2. Sums and unit-price × quantity are done on integer minor units, so they are exact.
// 3. Currency conversion is done per line with BigInt and rounded half-up to the target
//    currency's minor unit; totals are the sum of the rounded lines.
// 4. Exchange rates keep at most RATE_DECIMALS decimals.

export const RATE_DECIMALS = 6
export const MAX_AMOUNT = 1_000_000_000_000

const digitsCache = new Map<string, number>()

/** Number of minor-unit digits for an ISO 4217 code (THB → 2, JPY → 0). */
export function currencyDigits(currency: string): number {
  let digits = digitsCache.get(currency)
  if (digits === undefined) {
    try {
      digits =
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
          .maximumFractionDigits ?? 2
    } catch {
      digits = 2
    }
    digitsCache.set(currency, digits)
  }
  return digits
}

/** Scales a decimal number to an integer with `scale` decimals, rounding half-up. */
export function toScaledInt(value: number, scale: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Amount must be a finite number')
  const abs = Math.abs(value)
  const text = String(abs)
  let n: number
  if (text.includes('e')) {
    n = Math.round(abs * 10 ** scale)
  } else {
    const [intPart, frac = ''] = text.split('.')
    const digits = (frac + '0'.repeat(scale + 1)).slice(0, scale + 1)
    n = Number(intPart) * 10 ** scale + Number(digits.slice(0, scale) || '0')
    if (Number(digits[scale]) >= 5) n += 1
  }
  return value < 0 ? -n : n
}

export function toMinor(amount: number, currency: string): number {
  return toScaledInt(amount, currencyDigits(currency))
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency)
}

export function roundMoney(amount: number, currency: string): number {
  return fromMinor(toMinor(amount, currency), currency)
}

export function roundRate(rate: number): number {
  return toScaledInt(rate, RATE_DECIMALS) / 10 ** RATE_DECIMALS
}

export function sumMoney(amounts: readonly number[], currency: string): number {
  let total = 0
  for (const a of amounts) total += toMinor(a, currency)
  return fromMinor(total, currency)
}

/** Exact unit price × integer quantity. */
export function multiplyMoney(unitPrice: number, quantity: number, currency: string): number {
  if (!Number.isInteger(quantity)) throw new RangeError('Quantity must be an integer')
  return fromMinor(toMinor(unitPrice, currency) * quantity, currency)
}

function divRoundHalfUp(num: bigint, den: bigint): bigint {
  const negative = num < 0n !== den < 0n
  const n = num < 0n ? -num : num
  const d = den < 0n ? -den : den
  const q = n / d
  const result = (n % d) * 2n >= d ? q + 1n : q
  return negative ? -result : result
}

/** Converts `amount` (in `currency`) to THB using `rate` = THB per 1 unit. */
export function convertToTHB(amount: number, currency: string, rate: number): number {
  if (currency === 'THB') return roundMoney(amount, 'THB')
  const digits = currencyDigits(currency)
  const a = BigInt(toMinor(amount, currency))
  const r = BigInt(toScaledInt(rate, RATE_DECIMALS))
  const thbMinor = divRoundHalfUp(a * r * 100n, 10n ** BigInt(digits + RATE_DECIMALS))
  return Number(thbMinor) / 100
}

/** Converts a THB amount into `currency` using `rate` = THB per 1 unit of `currency`. */
export function convertFromTHB(amountTHB: number, currency: string, rate: number): number {
  if (currency === 'THB') return roundMoney(amountTHB, 'THB')
  const digits = currencyDigits(currency)
  const thbMinor = BigInt(toMinor(amountTHB, 'THB'))
  const r = BigInt(toScaledInt(rate, RATE_DECIMALS))
  if (r === 0n) throw new RangeError('Rate must be positive')
  const targetMinor = divRoundHalfUp(thbMinor * 10n ** BigInt(RATE_DECIMALS + digits), 100n * r)
  return Number(targetMinor) / 10 ** digits
}

/**
 * Parses user input such as "1,234.50". Commas and spaces are treated as thousands
 * separators. Returns null for empty input and NaN for invalid input.
 */
export function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '') return null
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === '.' || cleaned === '-') return Number.NaN
  return Number(cleaned)
}

/** Value for a numeric text input; avoids exponent notation and float noise. */
export function amountToInput(value: number | null | undefined, currency?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const digits = currency ? currencyDigits(currency) : RATE_DECIMALS
  return Number(value.toFixed(digits)).toString()
}
