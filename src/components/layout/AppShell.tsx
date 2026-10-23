import { Outlet } from 'react-router'
import { useVisualViewportVars } from '@/hooks/useViewport'
import { DialogHost, Toaster } from '../ui/Feedback'
import { BottomNav } from './BottomNav'
import { PwaUpdatePrompt } from './StatusBanners'

export function AppShell() {
  useVisualViewportVars()
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <main className="mx-auto w-full max-w-xl pb-[calc(env(safe-area-inset-bottom)+64px)]">
        <Outlet />
      </main>
      <BottomNav />
      <PwaUpdatePrompt />
      <Toaster />
      <DialogHost />
    </div>
  )
}
