import { useEffect, useMemo, useState } from "react"
import { LoginScreen } from "./components/LoginScreen"
import { StudentExamPanel } from "./components/StudentExamPanel"
import { AdminDashboard } from "./components/AdminDashboard"
import { AUTH_EXPIRED_EVENT } from "./lib/api"

const STORAGE_KEY = "smart-proctoring-session-v2"

function readStoredSession() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored)
    if (!parsed?.role || !parsed?.user_id) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function App() {
  const [session, setSession] = useState(() => readStoredSession())

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      return
    }
    localStorage.removeItem(STORAGE_KEY)
  }, [session])

  useEffect(() => {
    const handleExpiredAuth = () => setSession(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredAuth)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredAuth)
  }, [])

  const welcomeLabel = useMemo(() => {
    if (!session) return "AI-Based Smart Proctoring System"
    return session.role === "admin" ? "Central Monitoring Console" : "Live Exam Workspace"
  }, [session])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1b2a41_0%,#0f172a_45%,#060816_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">Secure Assessment Fabric</p>
            <h1 className="mt-2 font-display text-3xl tracking-tight text-white md:text-5xl">{welcomeLabel}</h1>
          </div>
          {session ? (
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right">
                <p className="text-sm text-slate-300">{session.full_name}</p>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">{session.role}</p>
              </div>
              <button
                className="rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/25"
                onClick={() => setSession(null)}
              >
                Logout
              </button>
            </div>
          ) : null}
        </header>

        {!session ? (
          <LoginScreen onAuthenticated={setSession} />
        ) : session.role === "student" ? (
          <StudentExamPanel session={session} />
        ) : (
          <AdminDashboard session={session} />
        )}
      </div>
    </div>
  )
}

export default App
