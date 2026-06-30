import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { LeadsPage } from './features/leads/LeadsPage'
import { CampaignsPage } from './features/campaigns/CampaignsPage'
import { PipelinePage } from './features/pipeline/PipelinePage'
import { InboxPage } from './features/inbox/InboxPage'
import { MessagesPage } from './features/messages/MessagesPage'
import { AutomationsPage } from './features/automations/AutomationsPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { SettingsPage } from './features/settings/SettingsPage'

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated)
  return isAuth ? children : <Navigate to="/login" replace />
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
          <Route index element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="automations" element={<AutomationsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
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
