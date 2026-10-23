export const HOME_CURRENCY = 'THB'

/** Currencies offered in pickers and accepted by validation (ISO 4217). */
export const SUPPORTED_CURRENCIES = [
  'THB', 'JPY', 'KRW', 'CNY', 'HKD', 'TWD', 'MOP', 'SGD', 'MYR', 'IDR', 'VND', 'PHP', 'LAK',
  'KHR', 'MMK', 'BND', 'INR', 'LKR', 'NPR', 'BTN', 'MVR', 'AED', 'QAR', 'SAR', 'OMR', 'JOD',
  'TRY', 'EGP', 'EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'ISK', 'CZK', 'HUF', 'PLN', 'GEL',
  'KZT', 'UZS', 'MNT', 'RUB', 'USD', 'CAD', 'MXN', 'BRL', 'AUD', 'NZD', 'FJD', 'ZAR', 'MAD',
] as const

const SUPPORTED = new Set<string>(SUPPORTED_CURRENCIES)

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED.has(code)
}

const nameCache = new Map<string, Intl.DisplayNames | null>()

export function currencyName(code: string, locale: string): string {
  let dn = nameCache.get(locale)
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([locale], { type: 'currency' })
    } catch {
      dn = null
    }
    nameCache.set(locale, dn)
  }
  return dn?.of(code) ?? code
}
