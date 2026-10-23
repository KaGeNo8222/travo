import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Language } from '@/db/repositories/settingsRepository'
import { en } from './en'
import { th, type TKey } from './th'

export type { TKey }
export type TParams = Record<string, string | number>

const DICTIONARIES: Record<Language, Record<TKey, string>> = { th, en }

/** Intl locale per UI language. Thai uses Gregorian years to match tickets and bookings. */
export const LOCALES: Record<Language, string> = {
  th: 'th-TH-u-ca-gregory',
  en: 'en-GB',
}

function interpolate(text: string, params?: TParams): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  )
}

export function hasKey(key: string): key is TKey {
  return key in th
}

export interface I18n {
  lang: Language
  locale: string
  /** Typed lookup. */
  t: (key: TKey, params?: TParams) => string
  /** Lookup for keys built at runtime (error codes, enum values); falls back to the key. */
  tx: (key: string, params?: TParams) => string
}

export function createI18n(lang: Language): I18n {
  const dict = DICTIONARIES[lang]
  const t = (key: TKey, params?: TParams) => interpolate(dict[key] ?? th[key] ?? key, params)
  return {
    lang,
    locale: LOCALES[lang],
    t,
    tx: (key, params) => (hasKey(key) ? t(key, params) : interpolate(key, params)),
  }
}

const I18nContext = createContext<I18n>(createI18n('th'))

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const value = useMemo(() => createI18n(lang), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}
