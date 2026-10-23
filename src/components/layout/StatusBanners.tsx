import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useI18n } from '@/i18n'
import { showToast } from '@/stores/uiStore'
import { Button } from '../ui/Button'

/** Thin strip shown above the tab bar while offline. */
export function OfflineStrip() {
  const { t } = useI18n()
  const online = useOnlineStatus()
  if (online) return null
  return (
    <p role="status" className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1 text-[12px] font-medium text-warning">
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      {t('offline.banner')}
    </p>
  )
}

const UPDATE_CHECK_MS = 60 * 60 * 1000

/** Service worker registration plus an "update available" prompt (no silent reloads). */
export function PwaUpdatePrompt() {
  const { t } = useI18n()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      window.setInterval(() => {
        if (navigator.onLine) void registration.update()
      }, UPDATE_CHECK_MS)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    showToast(t('pwa.offlineReady'), { tone: 'success' })
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady, t])

  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-[65] mx-auto max-w-xl px-4">
      <div className="flex animate-slide-up items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-xl">
        <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-[15px]">{t('pwa.updateAvailable')}</p>
        <Button size="sm" variant="secondary" onClick={() => setNeedRefresh(false)}>
          {t('pwa.later')}
        </Button>
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.update')}
        </Button>
      </div>
    </div>
  )
}
