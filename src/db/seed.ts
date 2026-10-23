import type { Category, PlaceCategory } from '@/types/entities'

/** System place categories. Their ids equal the PlaceCategory value and cannot be deleted. */
export const SYSTEM_CATEGORIES: Category[] = [
  { id: 'attraction', name: 'สถานที่ท่องเที่ยว', icon: 'landmark', color: '#3b6fd8', sortOrder: 0, isSystem: true },
  { id: 'restaurant', name: 'ร้านอาหาร', icon: 'utensils', color: '#d9622b', sortOrder: 1, isSystem: true },
  { id: 'cafe', name: 'คาเฟ่', icon: 'coffee', color: '#8a5a3c', sortOrder: 2, isSystem: true },
  { id: 'shopping', name: 'ช้อปปิ้ง', icon: 'shopping-bag', color: '#c2417a', sortOrder: 3, isSystem: true },
  { id: 'hotel', name: 'ที่พัก', icon: 'bed-double', color: '#6b4fc4', sortOrder: 4, isSystem: true },
  { id: 'transport', name: 'การเดินทาง', icon: 'train-front', color: '#1f8a7a', sortOrder: 5, isSystem: true },
  { id: 'other', name: 'อื่นๆ', icon: 'map-pin', color: '#6b7280', sortOrder: 6, isSystem: true },
]

const SYSTEM_IDS = new Set(SYSTEM_CATEGORIES.map((c) => c.id))

export function isSystemCategoryId(id: string): id is PlaceCategory {
  return SYSTEM_IDS.has(id)
}
