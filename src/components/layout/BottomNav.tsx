import { Link, useLocation, useMatch } from 'react-router'
import { CalendarDays, Ellipsis, House, MapPin, ShoppingBag, type LucideIcon } from 'lucide-react'
import { useAppSettings } from '@/hooks/useData'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/utils/cn'
import { OfflineStrip } from './StatusBanners'

interface Tab {
  key: string
  label: TKey
  icon: LucideIcon
  to: string
  active: boolean
}

export function BottomNav() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const tripMatch = useMatch('/trip/:tripId/*')
  const settings = useAppSettings()
  const tripId = tripMatch?.params.tripId ?? settings?.activeTripId ?? null
  const base = tripId ? `/trip/${tripId}` : null
  const section = tripMatch ? pathname.slice(`/trip/${tripMatch.params.tripId}`.length).split('/')[1] ?? '' : null

  const tabs: Tab[] = [
    { key: 'home', label: 'nav.home', icon: House, to: base ?? '/trips', active: section === '' || pathname === '/trips' },
  ]
  if (base) {
    tabs.push(
      { key: 'plan', label: 'nav.plan', icon: CalendarDays, to: `${base}/plan`, active: section === 'plan' },
      { key: 'places', label: 'nav.places', icon: MapPin, to: `${base}/places`, active: section === 'places' },
      { key: 'shopping', label: 'nav.shopping', icon: ShoppingBag, to: `${base}/shopping`, active: section === 'shopping' },
    )
  }
  tabs.push({
    key: 'more',
    label: 'nav.more',
    icon: Ellipsis,
    to: base ? `${base}/more` : '/settings',
    active: ['more', 'bookings', 'expenses'].includes(section ?? '') || pathname === '/settings',
  })

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 pb-safe backdrop-blur-xl backdrop-saturate-150"
    >
      <OfflineStrip />
      <ul className="mx-auto flex h-16 max-w-xl">
        {tabs.map((tab) => (
          <li key={tab.key} className="flex-1">
            <Link
              to={tab.to}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                tab.active ? 'text-primary' : 'text-subtle active:text-muted',
              )}
            >
              <tab.icon className="size-6" strokeWidth={tab.active ? 2.3 : 1.9} aria-hidden />
              {t(tab.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
