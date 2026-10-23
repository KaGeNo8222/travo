import { useEffect, type ReactNode } from 'react'
import type { Language, Theme } from '@/db/repositories/settingsRepository'
import { useAppSettings } from '@/hooks/useData'
import { I18nProvider } from '@/i18n'
import { isStandalone, readLocal, requestPersistentStorage, writeLocal } from '@/utils/storage'

const THEME_KEY = 'travo:theme'
const LANG_KEY = 'travo:lang'
const THEME_COLORS = { light: '#ffffff', dark: '#0b0f17' }

function cachedLanguage(): Language {
  return readLocal(LANG_KEY) === 'en' ? 'en' : 'th'
}

/** Applies the theme preference to <html> and keeps a local copy for the pre-paint script. */
function useTheme(theme: Theme | undefined) {
  useEffect(() => {
    if (!theme) return
    writeLocal(THEME_KEY, theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      metas.forEach((meta) => {
        if (theme === 'system') meta.content = meta.media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light
        else meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light
      })
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

export function AppProviders({ children }: { children: ReactNode }) {
  const settings = useAppSettings()
  const lang = settings?.language ?? cachedLanguage()
  useTheme(settings?.theme)

  useEffect(() => {
    document.documentElement.lang = lang
    writeLocal(LANG_KEY, lang)
  }, [lang])

  useEffect(() => {
    // Installed apps get a quiet request for persistent storage; browsers may decline.
    if (isStandalone()) void requestPersistentStorage()
  }, [])

  return <I18nProvider lang={lang}>{children}</I18nProvider>
}
