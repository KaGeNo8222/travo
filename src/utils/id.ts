/**
 * UUID v4. crypto.randomUUID() only exists in secure contexts (HTTPS/localhost), so fall back
 * to getRandomValues() when the dev server is opened over plain HTTP on the LAN.
 */
export function newId(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** System timestamp in ISO 8601 UTC. */
export function nowIso(): string {
  return new Date().toISOString()
}
