import { AnimatePresence, motion } from 'motion/react'
import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'

import { MobileNav } from './mobile-nav'
import { Sidebar } from './sidebar'

function PageFallback() {
  return (
    <div className="space-y-5 py-2" aria-label="正在加载页面">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const immersive = location.pathname.startsWith('/chat/')

  if (immersive) {
    return (
      <div className="bg-background h-dvh overflow-hidden">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="paper-canvas bg-background min-h-screen">
      <Sidebar />
      <div className="min-w-0 lg:pl-[17rem]">
        <main className="mx-auto w-full max-w-[1180px] min-w-0 px-4 pt-[calc(5rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))] sm:px-6 lg:px-10 lg:pt-9 lg:pb-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
