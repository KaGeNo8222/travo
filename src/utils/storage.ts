/** True when running as an installed home-screen app. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

/**
 * Asks the browser to keep IndexedDB data instead of evicting it under storage pressure.
 * Safari decides on its own (home-screen apps are favoured); there is no permission prompt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export interface StorageInfo {
  usage: number | null
  quota: number | null
  persisted: boolean | null
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = { usage: null, quota: null, persisted: null }
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      info.usage = estimate.usage ?? null
      info.quota = estimate.quota ?? null
    }
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted()
  } catch {
    // Storage APIs can be unavailable (e.g. some private modes); report unknown.
  }
  return info
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Non-essential convenience cache; ignore when storage is blocked.
  }
}
