import { useEffect, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'

import { useAppStore } from '@/stores/app-store'

function ThemeSync() {
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const theme = useAppStore((state) => state.theme)

  return (
    <BrowserRouter>
      <ThemeSync />
      {children}
      <Toaster
        theme={theme}
        position="top-center"
        closeButton={false}
        duration={4000}
        offset={{ top: 16 }}
        mobileOffset={{ top: 'calc(var(--safe-top) + 4.5rem)' }}
        toastOptions={{
          style: {
            borderRadius: '0.75rem',
          },
        }}
      />
    </BrowserRouter>
  )
}
