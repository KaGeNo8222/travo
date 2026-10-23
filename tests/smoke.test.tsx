import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/AppProviders'
import { routes } from '@/app/router'

// End-to-end smoke test: the real routes, providers and IndexedDB (fake-indexeddb),
// walking every screen with the sample trip. Catches render-time crashes and broken wiring.

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

const nav = () => within(screen.getByRole('navigation'))

describe('app smoke test', () => {
  it('creates the sample trip and opens every screen', { timeout: 30_000 }, async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )

    // Empty state → sample trip
    expect(await screen.findByText('ยังไม่มีทริป')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ลองดูทริปตัวอย่าง' }))

    // Dashboard
    expect(await screen.findByRole('heading', { name: 'โตเกียว–คามาคุระ (ตัวอย่าง)' }, { timeout: 10_000 })).toBeTruthy()
    expect(await screen.findByText('เที่ยวบินและที่พัก')).toBeTruthy()
    expect(screen.getAllByText('Hotel Gracery Shinjuku').length).toBeGreaterThan(0)
    expect(screen.getByText('TG 682', { exact: false })).toBeTruthy()

    // Itinerary
    fireEvent.click(nav().getByRole('link', { name: 'แผน' }))
    expect(await screen.findByRole('heading', { name: 'แผนเที่ยว' })).toBeTruthy()
    expect(await screen.findByText('ไหว้พระวัดเซ็นโซจิ เดินถนนนากามิเสะ')).toBeTruthy()
    expect(screen.getByText('มื้อเย็นแถวอาซากุสะ')).toBeTruthy() // unscheduled section

    // Places
    fireEvent.click(nav().getByRole('link', { name: 'สถานที่' }))
    expect(await screen.findByText('Senso-ji Temple')).toBeTruthy()
    const mapLinks = screen.getAllByRole('link', { name: /^เปิดแผนที่: / })
    expect(mapLinks[0].getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\//)

    // Shopping (defaults to "to buy")
    fireEvent.click(nav().getByRole('link', { name: 'ช้อปปิ้ง' }))
    expect(await screen.findByText('Tokyo Banana (กล่อง 8 ชิ้น)')).toBeTruthy()
    expect(screen.getByText('ซื้อแล้ว 1/2')).toBeTruthy() // partially bought sunscreen

    // More → Bookings
    fireEvent.click(nav().getByRole('link', { name: 'เพิ่มเติม' }))
    fireEvent.click(await screen.findByRole('link', { name: /การจอง/ }))
    expect(await screen.findByText('Thai Airways TG 682 · เที่ยวบิน')).toBeTruthy()
    expect(screen.queryByText('SAMPLE1')).toBeNull() // references are masked by default

    // More → Expenses
    fireEvent.click(nav().getByRole('link', { name: 'เพิ่มเติม' }))
    fireEvent.click(await screen.findByRole('link', { name: /ค่าใช้จ่าย/ }))
    expect(await screen.findByText('ใช้จ่ายทั้งหมด')).toBeTruthy()
    expect(screen.getByText('ตั๋ว Shibuya Sky')).toBeTruthy()
    expect(screen.getAllByText('จากรายการช้อปปิ้ง', { exact: false }).length).toBeGreaterThan(0)

    // Settings (lazy-loaded)
    await router.navigate('/settings')
    expect(await screen.findByText('สร้างไฟล์สำรองข้อมูล', {}, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByText('เลือกไฟล์สำรอง (.zip)')).toBeTruthy()

    // Unknown route
    await router.navigate('/nope')
    expect(await screen.findByText('ไม่พบหน้านี้')).toBeTruthy()
  })
})
