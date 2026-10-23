import { MapPin, Navigation } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { Place, TransportMode } from '@/types/entities'
import { buildDirectionsUrl, buildPlaceUrl, canOpenInMaps } from '@/utils/maps'
import { ExternalLinkButton, type ButtonSize, type ButtonVariant } from '../ui/Button'

interface MapsButtonProps {
  place: Place | null | undefined
  kind?: 'open' | 'directions'
  mode?: TransportMode
  size?: ButtonSize
  variant?: ButtonVariant
  block?: boolean
  label?: string
}

/** Opens Google Maps (web, or the app via the OS) for a place; renders nothing without a place. */
export function MapsButton({ place, kind = 'open', mode, size = 'sm', variant = 'secondary', block, label }: MapsButtonProps) {
  const { t } = useI18n()
  if (!place || !canOpenInMaps(place)) return null
  const directions = kind === 'directions'
  return (
    <ExternalLinkButton
      href={directions ? buildDirectionsUrl(place, mode) : buildPlaceUrl(place)}
      icon={directions ? Navigation : MapPin}
      size={size}
      variant={variant}
      block={block}
      aria-label={`${directions ? t('maps.directions') : t('maps.open')}: ${place.name}`}
    >
      {label ?? (directions ? t('maps.directions') : t('maps.open'))}
    </ExternalLinkButton>
  )
}
