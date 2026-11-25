import '@fontsource-variable/manrope'
import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { Providers } from './app/providers'
import { lockPageZoom } from './lib/lock-page-zoom'

lockPageZoom()

if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
  document.documentElement.dataset.platform = 'android'
}

async function enableMocking() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') {
    return
  }

  try {
    const { initializeVectorMemoryStore } = await import('./mocks/vector-memory-store')
    await initializeVectorMemoryStore()
  } catch (error) {
    console.error('Unable to initialize the local vector memory store.', error)
  }

  if ('__TAURI_INTERNALS__' in window || /Tauri/i.test(navigator.userAgent)) {
    const { enableNativeMocking } = await import('./mocks/native')
    enableNativeMocking()
    return
  }

  const { worker } = await import('./mocks/browser')
  await worker.start({
    onUnhandledFrame: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  })
}

const root = createRoot(document.getElementById('root')!)

enableMocking()
  .catch((error: unknown) => {
    console.error('Unable to start the mock API worker.', error)
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <Providers>
          <App />
        </Providers>
      </StrictMode>,
    )
  })
