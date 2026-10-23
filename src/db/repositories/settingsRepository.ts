import { z } from 'zod'
import { currencySchema } from '../schema'
import { db } from '../database'
import { nowIso } from '@/utils/id'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const LANGUAGES = ['th', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export interface BackupMeta {
  lastBackupAt: string
  lastBackupBytes: number
}

const settingSchemas = {
  theme: z.enum(THEMES),
  language: z.enum(LANGUAGES),
  /** Base currency suggested for new trips. */
  defaultCurrency: currencySchema,
  activeTripId: z.string().min(1).nullable(),
  backupMeta: z.object({ lastBackupAt: z.string(), lastBackupBytes: z.number() }).nullable(),
  /** Mask booking references in lists until tapped. */
  hideBookingRefs: z.boolean(),
}

export type SettingKey = keyof typeof settingSchemas
export type SettingValues = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> }

export const DEFAULT_SETTINGS: SettingValues = {
  theme: 'system',
  language: 'th',
  defaultCurrency: 'JPY',
  activeTripId: null,
  backupMeta: null,
  hideBookingRefs: true,
}

export function isSettingKey(key: string): key is SettingKey {
  return key in settingSchemas
}

/** Parses a stored value; falls back to the default when missing or malformed. */
export function readSettingValue<K extends SettingKey>(key: K, raw: unknown): SettingValues[K] {
  const parsed = settingSchemas[key].safeParse(raw)
  return parsed.success ? (parsed.data as SettingValues[K]) : DEFAULT_SETTINGS[key]
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
  const row = await db.app_settings.get(key)
  return row ? readSettingValue(key, row.value) : DEFAULT_SETTINGS[key]
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValues[K]): Promise<void> {
  const parsed = settingSchemas[key].parse(value)
  await db.app_settings.put({ key, value: parsed, updatedAt: nowIso() })
}

export async function getAllSettings(): Promise<SettingValues> {
  const rows = await db.app_settings.toArray()
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (isSettingKey(row.key)) out[row.key] = readSettingValue(row.key, row.value)
  }
  return out as SettingValues
}
