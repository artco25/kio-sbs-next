import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { FeedbackProvider, Spinner } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { allowedModules } from './modules'
import Login from './pages/Login'

const Suites = lazy(() => import('./pages/Suites'))

function Guarded() {
  const auth = useAuth()
  if (!auth.me) {
    if (!auth.ready && localStorage.getItem('kio_sbs_token'))
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      )
    return <Login />
  }
  const modules = allowedModules(auth)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Suites />} />
        {modules.flatMap((m) => [
          <Route key={m.path} path={m.path} element={<m.page />} />,
          ...(m.children ?? []).map((c) => <Route key={c.path} path={c.path} element={<c.page />} />),
        ])}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <Guarded />
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
