import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import { NotFoundPage } from '@/pages/not-found'

const HomePage = lazy(() => import('@/pages/home').then((module) => ({ default: module.HomePage })))
const LoadoutsPage = lazy(() =>
  import('@/pages/loadouts').then((module) => ({ default: module.LoadoutsPage })),
)
const CharactersPage = lazy(() =>
  import('@/pages/characters').then((module) => ({ default: module.CharactersPage })),
)
const CharacterDetailPage = lazy(() =>
  import('@/pages/character-detail').then((module) => ({ default: module.CharacterDetailPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/settings').then((module) => ({ default: module.SettingsPage })),
)
const LibraryPage = lazy(() =>
  import('@/pages/library').then((module) => ({ default: module.LibraryPage })),
)
const ImportCenterPage = lazy(() =>
  import('@/pages/import-center').then((module) => ({ default: module.ImportCenterPage })),
)
const ChatPage = lazy(() => import('@/pages/chat').then((module) => ({ default: module.ChatPage })))
const ChatSettingsPage = lazy(() =>
  import('@/pages/chat-settings').then((module) => ({ default: module.ChatSettingsPage })),
)

function RouteFallback() {
  return (
    <div
      className="bg-background flex h-dvh items-center justify-center"
      aria-label="正在加载页面"
    >
      <div className="border-primary size-6 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="loadouts" element={<LoadoutsPage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="characters/:id" element={<CharacterDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="import" element={<LibraryPage />} />
        <Route path="import/files" element={<ImportCenterPage />} />
        <Route path="settings/import" element={<Navigate to="/import/files" replace />} />
        <Route path="settings/library" element={<Navigate to="/import" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="chat/:id"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ChatPage />
          </Suspense>
        }
      />
      <Route
        path="chat/:id/settings"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ChatSettingsPage />
          </Suspense>
        }
      />
    </Routes>
  )
}
