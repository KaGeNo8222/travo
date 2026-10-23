// Generates the PWA / iOS home-screen icons as PNG files without extra dependencies.
// Usage: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const OUT = new URL('../public/icons/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const BG_FROM = [0x1c, 0x3a, 0x66]
const BG_TO = [0x0f, 0x22, 0x40]
const WHITE = [0xff, 0xff, 0xff]
const ACCENT = [0x8f, 0xb4, 0xff]

// Map-pin glyph in a 512×512 design space.
const C = { x: 256, y: 216 }
const R = 118
const TIP = { x: 256, y: 416 }
const DOT_R = 44
const dist = Math.hypot(TIP.x - C.x, TIP.y - C.y)
const cos = R / dist
const sin = Math.sqrt(1 - cos * cos)
const A = { x: C.x - R * sin, y: C.y + R * cos }
const B = { x: C.x + R * sin, y: C.y + R * cos }

const edge = (p, q, x, y) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x)
function inTriangle(x, y) {
  const d1 = edge(A, B, x, y)
  const d2 = edge(B, TIP, x, y)
  const d3 = edge(TIP, A, x, y)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

/** Colour of a design-space point, or null for background. */
function glyph(x, y) {
  if (inCircle(x, y, C.x, C.y, DOT_R)) return ACCENT
  if (inCircle(x, y, C.x, C.y, R) || inTriangle(x, y)) return WHITE
  return null
}

function render(size, glyphScale) {
  const data = Buffer.alloc(size * size * 4)
  const SS = 4
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const t = (px + py) / (2 * size)
      const bg = BG_FROM.map((c, i) => c + (BG_TO[i] - c) * t)
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((px + (sx + 0.5) / SS) / size) * 512
          const uy = ((py + (sy + 0.5) / SS) / size) * 512
          const gx = 256 + (ux - 256) / glyphScale
          const gy = 257 + (uy - 257) / glyphScale
          const col = glyph(gx, gy) ?? bg
          acc[0] += col[0]
          acc[1] += col[1]
          acc[2] += col[2]
        }
      }
      const o = (py * size + px) * 4
      data[o] = Math.round(acc[0] / (SS * SS))
      data[o + 1] = Math.round(acc[1] / (SS * SS))
      data[o + 2] = Math.round(acc[2] / (SS * SS))
      data[o + 3] = 255
    }
  }
  return encodePng(size, size, data)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, payload) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(payload.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const files = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['maskable-512.png', 512, 0.82],
  ['apple-touch-icon.png', 180, 0.92],
]
for (const [name, size, scale] of files) {
  writeFileSync(new URL(name, OUT), render(size, scale))
  console.log(`wrote public/icons/${name}`)
}

const f = (n) => n.toFixed(1)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3a66"/><stop offset="1" stop-color="#0f2240"/></linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <circle cx="${C.x}" cy="${C.y}" r="${R}" fill="#fff"/>
  <polygon points="${f(A.x)},${f(A.y)} ${f(B.x)},${f(B.y)} ${TIP.x},${TIP.y}" fill="#fff"/>
  <circle cx="${C.x}" cy="${C.y}" r="${DOT_R}" fill="#8fb4ff"/>
</svg>
`
writeFileSync(new URL('favicon.svg', OUT), svg)
console.log('wrote public/icons/favicon.svg')
