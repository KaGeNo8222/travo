// Common destinations, used to suggest a time zone and currency when creating a trip.
// The suggestion is only a convenience — users can always pick another zone or currency.

export interface CountryPreset {
  code: string
  th: string
  en: string
  timezone: string
  currency: string
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  { code: 'JP', th: 'ญี่ปุ่น', en: 'Japan', timezone: 'Asia/Tokyo', currency: 'JPY' },
  { code: 'KR', th: 'เกาหลีใต้', en: 'South Korea', timezone: 'Asia/Seoul', currency: 'KRW' },
  { code: 'CN', th: 'จีน', en: 'China', timezone: 'Asia/Shanghai', currency: 'CNY' },
  { code: 'HK', th: 'ฮ่องกง', en: 'Hong Kong', timezone: 'Asia/Hong_Kong', currency: 'HKD' },
  { code: 'MO', th: 'มาเก๊า', en: 'Macau', timezone: 'Asia/Macau', currency: 'MOP' },
  { code: 'TW', th: 'ไต้หวัน', en: 'Taiwan', timezone: 'Asia/Taipei', currency: 'TWD' },
  { code: 'SG', th: 'สิงคโปร์', en: 'Singapore', timezone: 'Asia/Singapore', currency: 'SGD' },
  { code: 'MY', th: 'มาเลเซีย', en: 'Malaysia', timezone: 'Asia/Kuala_Lumpur', currency: 'MYR' },
  { code: 'VN', th: 'เวียดนาม', en: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' },
  { code: 'ID', th: 'อินโดนีเซีย', en: 'Indonesia', timezone: 'Asia/Jakarta', currency: 'IDR' },
  { code: 'PH', th: 'ฟิลิปปินส์', en: 'Philippines', timezone: 'Asia/Manila', currency: 'PHP' },
  { code: 'LA', th: 'ลาว', en: 'Laos', timezone: 'Asia/Vientiane', currency: 'LAK' },
  { code: 'KH', th: 'กัมพูชา', en: 'Cambodia', timezone: 'Asia/Phnom_Penh', currency: 'KHR' },
  { code: 'MM', th: 'เมียนมา', en: 'Myanmar', timezone: 'Asia/Yangon', currency: 'MMK' },
  { code: 'IN', th: 'อินเดีย', en: 'India', timezone: 'Asia/Kolkata', currency: 'INR' },
  { code: 'LK', th: 'ศรีลังกา', en: 'Sri Lanka', timezone: 'Asia/Colombo', currency: 'LKR' },
  { code: 'NP', th: 'เนปาล', en: 'Nepal', timezone: 'Asia/Kathmandu', currency: 'NPR' },
  { code: 'BT', th: 'ภูฏาน', en: 'Bhutan', timezone: 'Asia/Thimphu', currency: 'BTN' },
  { code: 'MV', th: 'มัลดีฟส์', en: 'Maldives', timezone: 'Indian/Maldives', currency: 'MVR' },
  { code: 'AE', th: 'สหรัฐอาหรับเอมิเรตส์', en: 'United Arab Emirates', timezone: 'Asia/Dubai', currency: 'AED' },
  { code: 'TR', th: 'ตุรกี', en: 'Türkiye', timezone: 'Europe/Istanbul', currency: 'TRY' },
  { code: 'GE', th: 'จอร์เจีย', en: 'Georgia', timezone: 'Asia/Tbilisi', currency: 'GEL' },
  { code: 'KZ', th: 'คาซัคสถาน', en: 'Kazakhstan', timezone: 'Asia/Almaty', currency: 'KZT' },
  { code: 'UZ', th: 'อุซเบกิสถาน', en: 'Uzbekistan', timezone: 'Asia/Tashkent', currency: 'UZS' },
  { code: 'MN', th: 'มองโกเลีย', en: 'Mongolia', timezone: 'Asia/Ulaanbaatar', currency: 'MNT' },
  { code: 'EG', th: 'อียิปต์', en: 'Egypt', timezone: 'Africa/Cairo', currency: 'EGP' },
  { code: 'GB', th: 'สหราชอาณาจักร', en: 'United Kingdom', timezone: 'Europe/London', currency: 'GBP' },
  { code: 'FR', th: 'ฝรั่งเศส', en: 'France', timezone: 'Europe/Paris', currency: 'EUR' },
  { code: 'IT', th: 'อิตาลี', en: 'Italy', timezone: 'Europe/Rome', currency: 'EUR' },
  { code: 'DE', th: 'เยอรมนี', en: 'Germany', timezone: 'Europe/Berlin', currency: 'EUR' },
  { code: 'ES', th: 'สเปน', en: 'Spain', timezone: 'Europe/Madrid', currency: 'EUR' },
  { code: 'NL', th: 'เนเธอร์แลนด์', en: 'Netherlands', timezone: 'Europe/Amsterdam', currency: 'EUR' },
  { code: 'AT', th: 'ออสเตรีย', en: 'Austria', timezone: 'Europe/Vienna', currency: 'EUR' },
  { code: 'FI', th: 'ฟินแลนด์', en: 'Finland', timezone: 'Europe/Helsinki', currency: 'EUR' },
  { code: 'CH', th: 'สวิตเซอร์แลนด์', en: 'Switzerland', timezone: 'Europe/Zurich', currency: 'CHF' },
  { code: 'CZ', th: 'เช็กเกีย', en: 'Czechia', timezone: 'Europe/Prague', currency: 'CZK' },
  { code: 'NO', th: 'นอร์เวย์', en: 'Norway', timezone: 'Europe/Oslo', currency: 'NOK' },
  { code: 'IS', th: 'ไอซ์แลนด์', en: 'Iceland', timezone: 'Atlantic/Reykjavik', currency: 'ISK' },
  { code: 'US', th: 'สหรัฐอเมริกา', en: 'United States', timezone: 'America/New_York', currency: 'USD' },
  { code: 'CA', th: 'แคนาดา', en: 'Canada', timezone: 'America/Toronto', currency: 'CAD' },
  { code: 'AU', th: 'ออสเตรเลีย', en: 'Australia', timezone: 'Australia/Sydney', currency: 'AUD' },
  { code: 'NZ', th: 'นิวซีแลนด์', en: 'New Zealand', timezone: 'Pacific/Auckland', currency: 'NZD' },
  { code: 'TH', th: 'ไทย', en: 'Thailand', timezone: 'Asia/Bangkok', currency: 'THB' },
]

export function findCountryPreset(name: string): CountryPreset | undefined {
  const q = name.trim().toLowerCase()
  if (!q) return undefined
  return COUNTRY_PRESETS.find(
    (c) => c.th === q || c.en.toLowerCase() === q || c.code.toLowerCase() === q,
  )
}
