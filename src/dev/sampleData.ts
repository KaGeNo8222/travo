// Realistic sample trip for development, testing and demos. It is only created when the user
// explicitly asks for it (Settings → sample data, or the empty "My trips" screen) — never
// automatically. Times and prices are illustrative, not real schedules.

import { listTripDays } from '@/db/repositories/tripRepository'
import { createBooking } from '@/services/bookingService'
import { createExpense } from '@/services/expenseService'
import { createActivity } from '@/services/itineraryService'
import { createPlace } from '@/services/placeService'
import { createShoppingItem, setPurchasedQuantity } from '@/services/shoppingService'
import { createTrip, updateTripSettings } from '@/services/tripService'
import type { Trip } from '@/types/entities'
import { addDaysToDate, deviceTimeZone, todayInTimeZone } from '@/utils/time'

const search = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

export async function createSampleTrip(startDate?: string): Promise<Trip> {
  const start = startDate ?? addDaysToDate(todayInTimeZone(deviceTimeZone()), 14)
  const end = addDaysToDate(start, 4)
  const trip = await createTrip(
    {
      name: 'โตเกียว–คามาคุระ (ตัวอย่าง)',
      destinationCountry: 'ญี่ปุ่น',
      destinationCities: ['โตเกียว', 'คามาคุระ'],
      startDate: start,
      endDate: end,
      timezone: 'Asia/Tokyo',
      status: 'planning',
      notes: 'ทริปตัวอย่างสำหรับทดลองใช้งาน — เวลาเที่ยวบิน ราคา และรหัสการจองไม่ใช่ข้อมูลจริง ลบได้ตลอดเวลา',
    },
    { baseCurrency: 'JPY' },
  )
  await updateTripSettings(trip.id, { exchangeRateToTHB: 0.235, budgetAmount: 60000, budgetCurrency: 'THB' })

  const place = (name: string, categoryId: string, address: string, extra: Partial<Parameters<typeof createPlace>[1]> = {}) =>
    createPlace(trip.id, { name, categoryId, address, googleMapsUrl: search(name), isVisited: false, ...extra })

  const sensoji = await place('Senso-ji Temple', 'attraction', '2-3-1 Asakusa, Taito City, Tokyo', {
    openingHoursNote: 'ห้องโถงหลัก 6:00–17:00',
    estimatedVisitMinutes: 90,
  })
  const tsukiji = await place('Tsukiji Outer Market', 'restaurant', 'Tsukiji 4-chome, Chuo City, Tokyo', {
    notes: 'ไปเช้า ร้านส่วนใหญ่ปิดช่วงบ่าย',
  })
  const shibuyaSky = await place('Shibuya Sky', 'attraction', 'Shibuya Scramble Square, 2-24-12 Shibuya, Tokyo', {
    notes: 'จองตั๋วรอบพระอาทิตย์ตกล่วงหน้า',
  })
  const donki = await place('MEGA Don Quijote Shibuya', 'shopping', '28-6 Udagawacho, Shibuya City, Tokyo', {
    openingHoursNote: 'เปิด 24 ชั่วโมง',
  })
  const daibutsu = await place('Kotoku-in (Great Buddha of Kamakura)', 'attraction', '4-2-28 Hase, Kamakura, Kanagawa')
  const hachimangu = await place('Tsurugaoka Hachimangu', 'attraction', '2-1-31 Yukinoshita, Kamakura, Kanagawa')
  const hotel = await place('Hotel Gracery Shinjuku', 'hotel', '1-19-1 Kabukicho, Shinjuku City, Tokyo')
  const cafe = await place('Blue Bottle Coffee Shinjuku', 'cafe', 'Shinjuku, Tokyo')

  const days = await listTripDays(trip.id)
  const act = (day: number, title: string, extra: Partial<Parameters<typeof createActivity>[1]> = {}) =>
    createActivity(trip.id, { tripDayId: days[day].id, title, status: 'planned', ...extra })

  await act(0, 'ถึงสนามบินฮาเนดะ ซื้อบัตร Suica', { startTime: '07:00', endTime: '08:30', activityType: 'transport' })
  await act(0, 'ฝากกระเป๋าที่โรงแรม', { startTime: '10:00', endTime: '10:30', placeId: hotel.id, transportMode: 'train', travelMinutes: 45 })
  await act(0, 'ไหว้พระวัดเซ็นโซจิ เดินถนนนากามิเสะ', {
    startTime: '13:00',
    endTime: '15:30',
    placeId: sensoji.id,
    activityType: 'sightseeing',
    transportMode: 'transit',
    travelMinutes: 30,
  })
  await act(0, 'มื้อเย็นแถวอาซากุสะ', { activityType: 'food' })
  const tsukijiAct = await act(1, 'อาหารเช้าที่ตลาดสึกิจิ', { startTime: '08:00', endTime: '10:00', placeId: tsukiji.id, activityType: 'food' })
  await act(1, 'ช้อปปิ้งดองกี้', { startTime: '12:30', endTime: '14:30', placeId: donki.id, activityType: 'shopping' })
  const skyAct = await act(1, 'ชมวิวพระอาทิตย์ตก Shibuya Sky', {
    startTime: '16:30',
    endTime: '18:00',
    placeId: shibuyaSky.id,
    activityType: 'sightseeing',
    transportMode: 'walking',
    travelMinutes: 10,
  })
  await act(2, 'นั่งรถไฟ JR ไปคามาคุระ', { startTime: '08:30', endTime: '09:45', activityType: 'transport', transportMode: 'train' })
  await act(2, 'พระใหญ่คามาคุระ', { startTime: '10:15', endTime: '11:30', placeId: daibutsu.id, activityType: 'sightseeing' })
  await act(2, 'ศาลเจ้าสึรุงะโอกะฮาจิมังงู', { startTime: '13:00', endTime: '14:30', placeId: hachimangu.id, activityType: 'sightseeing' })
  await act(3, 'วันว่าง: ช้อปปิ้งชินจูกุ', { activityType: 'shopping' })
  await act(3, 'พักกาแฟ', { placeId: cafe.id, activityType: 'food' })
  await act(4, 'เช็คเอาท์', { startTime: '10:00', endTime: '10:30', placeId: hotel.id })
  await act(4, 'เดินทางไปสนามบินฮาเนดะ', { startTime: '13:30', endTime: '14:30', activityType: 'transport', transportMode: 'train' })

  const item = (name: string, extra: Partial<Parameters<typeof createShoppingItem>[1]>) =>
    createShoppingItem(trip.id, {
      name,
      quantity: 1,
      purchasedQuantity: 0,
      currency: 'JPY',
      priority: 'medium',
      cancelled: false,
      ...extra,
    })
  await item('Tokyo Banana (กล่อง 8 ชิ้น)', { quantity: 3, estimatedUnitPrice: 1200, recipient: 'ที่ทำงาน', priority: 'high' })
  await item('ยาหยอดตา Rohto Gold 40', { quantity: 2, estimatedUnitPrice: 800, recipient: 'แม่', shopPlaceId: donki.id, priority: 'high' })
  await item('KitKat รสมัทฉะ', { quantity: 5, estimatedUnitPrice: 650, recipient: 'เพื่อน', shopPlaceId: donki.id })
  const sunscreen = await item('กันแดด Anessa', { quantity: 2, estimatedUnitPrice: 2400, recipient: 'พี่สาว', shopPlaceId: donki.id })
  await setPurchasedQuantity(sunscreen.id, 1, 2180)
  const shirt = await item('เสื้อ Uniqlo U', { estimatedUnitPrice: 2990, recipient: 'ตัวเอง', priority: 'low' })
  await setPurchasedQuantity(shirt.id, 1, 2490)

  await createBooking(trip.id, {
    type: 'flight',
    title: 'กรุงเทพฯ → โตเกียว',
    provider: 'Thai Airways',
    flightNumber: 'TG 682',
    origin: 'BKK',
    destination: 'HND',
    startLocalDateTime: `${addDaysToDate(start, -1)}T22:30`,
    startTimezone: 'Asia/Bangkok',
    endLocalDateTime: `${start}T06:40`,
    endTimezone: 'Asia/Tokyo',
    terminal: 'สุวรรณภูมิ อาคารผู้โดยสาร 1',
    bookingReference: 'SAMPLE1',
  })
  await createBooking(trip.id, {
    type: 'flight',
    title: 'โตเกียว → กรุงเทพฯ',
    provider: 'Thai Airways',
    flightNumber: 'TG 661',
    origin: 'HND',
    destination: 'BKK',
    startLocalDateTime: `${end}T16:50`,
    startTimezone: 'Asia/Tokyo',
    endLocalDateTime: `${end}T21:40`,
    endTimezone: 'Asia/Bangkok',
    terminal: 'Haneda Terminal 3',
    bookingReference: 'SAMPLE1',
  })
  await createBooking(trip.id, {
    type: 'hotel',
    title: 'Hotel Gracery Shinjuku',
    provider: 'Agoda',
    startLocalDateTime: `${start}T15:00`,
    endLocalDateTime: `${end}T11:00`,
    address: '1-19-1 Kabukicho, Shinjuku City, Tokyo',
    placeId: hotel.id,
    bookingReference: 'SAMPLE-HTL-2048',
    notes: 'ฝากกระเป๋าก่อนเช็คอินได้',
  })

  await createExpense(trip.id, { description: 'เติมเงิน Suica', amount: 5000, currency: 'JPY', expenseDate: start, category: 'transport' })
  await createExpense(trip.id, { description: 'ราเมนมื้อแรก', amount: 1180, currency: 'JPY', expenseDate: start, category: 'food' })
  await createExpense(trip.id, {
    description: 'อาหารเช้าที่สึกิจิ',
    amount: 3200,
    currency: 'JPY',
    expenseDate: addDaysToDate(start, 1),
    category: 'food',
    activityId: tsukijiAct.id,
  })
  await createExpense(trip.id, {
    description: 'ตั๋ว Shibuya Sky',
    amount: 2500,
    currency: 'JPY',
    expenseDate: addDaysToDate(start, 1),
    category: 'activity',
    activityId: skyAct.id,
  })
  await createExpense(trip.id, { description: 'Pocket Wi-Fi', amount: 1290, currency: 'THB', expenseDate: start, category: 'other' })
  return trip
}
