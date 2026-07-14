import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LeadsPage = lazy(() => import('./features/leads/LeadsPage').then((m) => ({ default: m.LeadsPage })))
const CampaignsPage = lazy(() => import('./features/campaigns/CampaignsPage').then((m) => ({ default: m.CampaignsPage })))
const PipelinePage = lazy(() => import('./features/pipeline/PipelinePage').then((m) => ({ default: m.PipelinePage })))
const InboxPage = lazy(() => import('./features/inbox/InboxPage').then((m) => ({ default: m.InboxPage })))
const WebLeadsPage = lazy(() => import('./features/webleads/WebLeadsPage').then((m) => ({ default: m.WebLeadsPage })))
const TareasPage = lazy(() => import('./features/tareas/TareasPage').then((m) => ({ default: m.TareasPage })))
const MessagesPage = lazy(() => import('./features/messages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const AutomationsPage = lazy(() => import('./features/automations/AutomationsPage').then((m) => ({ default: m.AutomationsPage })))
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const TrashPage = lazy(() => import('./features/trash/TrashPage').then((m) => ({ default: m.TrashPage })))

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated)
  return isAuth ? children : <Navigate to="/login" replace />
}

function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense>} />
          <Route path="leads" element={<Suspense fallback={<RouteFallback />}><LeadsPage /></Suspense>} />
          <Route path="campaigns" element={<Suspense fallback={<RouteFallback />}><CampaignsPage /></Suspense>} />
          <Route path="pipeline" element={<Suspense fallback={<RouteFallback />}><PipelinePage /></Suspense>} />
          <Route path="inbox" element={<Suspense fallback={<RouteFallback />}><InboxPage /></Suspense>} />
          <Route path="web-leads" element={<Suspense fallback={<RouteFallback />}><WebLeadsPage /></Suspense>} />
          <Route path="tareas" element={<Suspense fallback={<RouteFallback />}><TareasPage /></Suspense>} />
          <Route path="messages" element={<Suspense fallback={<RouteFallback />}><MessagesPage /></Suspense>} />
          <Route path="automations" element={<Suspense fallback={<RouteFallback />}><AutomationsPage /></Suspense>} />
          <Route path="analytics" element={<Suspense fallback={<RouteFallback />}><AnalyticsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense>} />
          <Route path="papelera" element={<Suspense fallback={<RouteFallback />}><TrashPage /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
          success: { iconTheme: { primary: '#ff7448', secondary: '#fff' } },
        }}
      />
    </>
  )
}
