import {
  BedDouble,
  Building2,
  Camera,
  Coffee,
  Gift,
  Heart,
  Landmark,
  MapPin,
  Mountain,
  Music,
  Palette,
  ShoppingBag,
  Star,
  Tent,
  Ticket,
  TrainFront,
  Utensils,
  Waves,
  type LucideIcon,
} from 'lucide-react'

/** Icons selectable for categories, keyed by the name stored in Category.icon. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  landmark: Landmark,
  utensils: Utensils,
  coffee: Coffee,
  'shopping-bag': ShoppingBag,
  'bed-double': BedDouble,
  'train-front': TrainFront,
  'map-pin': MapPin,
  mountain: Mountain,
  waves: Waves,
  camera: Camera,
  music: Music,
  heart: Heart,
  star: Star,
  'building-2': Building2,
  ticket: Ticket,
  gift: Gift,
  palette: Palette,
  tent: Tent,
}

export const CATEGORY_COLORS = [
  '#3b6fd8',
  '#d9622b',
  '#8a5a3c',
  '#c2417a',
  '#6b4fc4',
  '#1f8a7a',
  '#b8860b',
  '#2e7d32',
  '#6b7280',
]

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || MapPin
}
