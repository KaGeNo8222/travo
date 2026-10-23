import { useEffect } from 'react'

/**
 * Publishes the visual viewport as CSS variables (--vv-height, --vv-top). Sheets use them to
 * stay above the iOS on-screen keyboard instead of being covered by it.
 */
export function useVisualViewportVars(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--vv-height', `${vv.height}px`)
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
}

let lockCount = 0

/** Prevents the page behind an open sheet from scrolling. Nested locks are counted. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    lockCount++
    document.body.style.overflow = 'hidden'
    return () => {
      lockCount--
      if (lockCount === 0) document.body.style.overflow = ''
    }
  }, [active])
}
