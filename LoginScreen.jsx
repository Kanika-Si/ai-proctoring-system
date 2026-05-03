import { useState } from "react"
import { api } from "../lib/api"

const rolePresets = {
  student: {
    title: "Student Exam Portal",
    helper: "Use the seeded demo account or your own database-backed student account.",
    email: "student1@proctoring.demo",
    password: "student123",
  },
  admin: {
    title: "Admin Monitoring Portal",
    helper: "Admin receives live alerts, scores, timelines, and AI-generated integrity reports.",
    email: "admin@proctoring.demo",
    password: "admin123",
  },
}

export function LoginScreen({ onAuthenticated }) {
  const [role, setRole] = useState("student")
  const [email, setEmail] = useState(rolePresets.student.email)
  const [password, setPassword] = useState(rolePresets.student.password)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const switchRole = (nextRole) => {
    setRole(nextRole)
    setEmail(rolePresets[nextRole].email)
    setPassword(rolePresets[nextRole].password)
    setError("")
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await api.login({ email, password, role })
      onAuthenticated(response)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="panel overflow-hidden">
        <div className="relative isolate rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(140deg,rgba(34,211,238,0.18),transparent_45%,rgba(251,113,133,0.16))]" />
          <p className="metric-pill inline-flex text-cyan-200">Live AI Oversight</p>
          <h2 className="mt-6 font-display text-4xl text-white">Scalable smart proctoring for remote assessments.</h2>
          <p className="mt-4 max-w-2xl text-slate-300">
            This starter ships with student capture, multi-student monitoring, AI alert scoring, timeline analytics,
            and LLM-based report generation wired into one flow.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Realtime capture", "Browser webcam frames are sampled every 2 seconds and analyzed by the backend."],
              ["AI event graph", "Face absence, multiple faces, phones, tab switching, and audio spikes feed the risk engine."],
              ["RAG reporting", "Stored alerts are retrieved and summarized into an investigation-ready report."],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <h3 className="font-display text-lg text-white">{title}</h3>
                <p className="mt-2 text-sm text-slate-300">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="flex gap-2 rounded-full border border-white/10 bg-slate-950/60 p-1">
          {["student", "admin"].map((choice) => (
            <button
              key={choice}
              className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
                choice === role ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/5"
              }`}
              onClick={() => switchRole(choice)}
              type="button"
            >
              {choice === "student" ? "Student" : "Admin"}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <h2 className="panel-title">{rolePresets[role].title}</h2>
            <p className="mt-2 text-sm text-slate-300">{rolePresets[role].helper}</p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Email</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none ring-0 transition focus:border-cyan-400/50"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Password</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none ring-0 transition focus:border-cyan-400/50"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
            />
          </label>

          {error ? <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

          <button
            className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={loading}
            type="submit"
          >
            {loading ? "Signing in..." : "Enter Workspace"}
          </button>
        </form>
      </section>
    </div>
  )
}
