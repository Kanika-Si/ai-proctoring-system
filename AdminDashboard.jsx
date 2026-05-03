import { useEffect, useRef, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { api } from "../lib/api"
import { formatDateTime, progressTone, riskTone } from "../lib/formatters"

export function AdminDashboard() {
  const audioRef = useRef(null)
  const lastAlertKeyRef = useRef("")
  const lastHighRiskStudentRef = useRef("")
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [selectedStudentId, setSelectedStudentId] = useState("")
  const [alerts, setAlerts] = useState([])
  const [score, setScore] = useState(null)
  const [report, setReport] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [error, setError] = useState("")

  useEffect(() => {
    audioRef.current = new Audio("/alert.mp3")
    audioRef.current.volume = 0.7
  }, [])

  const playAlertSound = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => null)
  }

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const studentList = await api.getStudents()
        setStudents(studentList)

        const activeStudentId = selectedStudentId || studentList[0]?.id || ""
        if (!activeStudentId) return
        setSelectedStudentId(activeStudentId)

        const [studentDetail, alertData, scoreData, reportResult, timelineData] = await Promise.all([
          api.getStudent(activeStudentId),
          api.getAlerts(activeStudentId),
          api.getScore(activeStudentId),
          api.getReport(activeStudentId).catch(() => null),
          api.getTimeline(activeStudentId),
        ])

        setSelectedStudent(studentDetail)
        setAlerts(alertData)
        setScore(scoreData)
        setReport(reportResult)
        setTimeline(timelineData)
        setError("")

        const latestPriorityAlert = alertData.find(
          (alert) => alert.event_type === "phone_detected" || alert.severity >= 40,
        )
        if (latestPriorityAlert && latestPriorityAlert.id !== lastAlertKeyRef.current) {
          playAlertSound()
          lastAlertKeyRef.current = latestPriorityAlert.id
        }

        if (scoreData?.risk_level === "HIGH" && activeStudentId !== lastHighRiskStudentRef.current) {
          playAlertSound()
          lastHighRiskStudentRef.current = activeStudentId
        }

        if (scoreData?.risk_level !== "HIGH" && lastHighRiskStudentRef.current === activeStudentId) {
          lastHighRiskStudentRef.current = ""
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }

    loadDashboard()
    const interval = window.setInterval(loadDashboard, 3000)
    return () => window.clearInterval(interval)
  }, [selectedStudentId])

  useEffect(() => {
    setSelectedStudent(null)
    setReport(null)
  }, [selectedStudentId])

  const highRiskCount = students.filter((student) => student.risk_level === "HIGH").length
  const averageScore = students.length
    ? Math.round(students.reduce((sum, student) => sum + student.score, 0) / students.length)
    : 0
  const criticalAlerts = alerts.filter((alert) => alert.severity >= 40).length

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Candidates" value={students.length} helper="Currently visible in the monitoring pool" />
          <SummaryCard label="High Risk" value={highRiskCount} helper="Students who crossed the high-risk threshold" tone="danger" />
          <SummaryCard label="Avg Score" value={`${averageScore}/100`} helper="Average integrity score across active candidates" />
        </div>

        <div className="panel">
          <div className="flex items-center justify-between">
            <h2 className="panel-title">Student Command Grid</h2>
            <span className="metric-pill border-white/10 bg-white/5 text-slate-200">{students.length} active candidates</span>
          </div>

          <div className="mt-5 space-y-3">
            {students.map((student) => (
              <button
                key={student.id}
                className={`w-full rounded-[1.35rem] border p-4 text-left transition ${
                  selectedStudentId === student.id
                    ? "border-cyan-300/50 bg-cyan-400/10"
                    : "border-white/10 bg-slate-950/45 hover:bg-white/5"
                }`}
                onClick={() => setSelectedStudentId(student.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg text-white">{student.full_name}</p>
                    <p className="text-sm text-slate-400">{student.email}</p>
                  </div>
                  <span className={`metric-pill border ${riskTone(student.risk_level)}`}>{student.risk_level}</span>
                </div>
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-slate-800">
                    <div className={`h-2 rounded-full ${progressTone(student.score)}`} style={{ width: `${student.score}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Score {student.score}/100</span>
                    <span>{student.exam_active ? "Exam active" : "Terminated"}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="panel-title">Live Alerts</h2>
            <span className="metric-pill border-rose-400/20 bg-rose-500/10 text-rose-100">{criticalAlerts} critical</span>
          </div>
          <div className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto pr-1">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{alert.message}</p>
                  <span className={`metric-pill border ${alert.severity > 0 ? "border-rose-400/20 bg-rose-500/10 text-rose-100" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"}`}>
                    {alert.event_type}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{formatDateTime(alert.created_at)}</p>
              </div>
            ))}
            {!alerts.length ? <p className="text-sm text-slate-400">No alerts yet for this student.</p> : null}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">Focused Review</p>
              <h2 className="panel-title">Selected Candidate</h2>
              <p className="mt-2 text-sm text-slate-300">{selectedStudent?.full_name || "Choose a student from the left"}</p>
            </div>
            {score ? <span className={`metric-pill border ${riskTone(score.risk_level)}`}>{score.risk_level} RISK</span> : null}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80">
              {selectedStudent?.latest_frame_base64 ? (
                <img
                  alt={selectedStudent.full_name}
                  className="aspect-video w-full object-cover"
                  src={selectedStudent.latest_frame_base64}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-slate-400">Waiting for student frames...</div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Cheating Score</p>
                <p className="mt-2 font-display text-4xl text-white">{score?.score ?? 0}</p>
                <div className="mt-4 h-3 rounded-full bg-slate-800">
                  <div className={`h-3 rounded-full transition-all ${progressTone(score?.score ?? 0)}`} style={{ width: `${score?.score ?? 0}%` }} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <MiniInfo label="Exam state" value={selectedStudent?.exam_active ? "Active" : "Terminated"} />
                <MiniInfo
                  label="Report source"
                  value={
                    report?.report_source === "stored_logs"
                      ? "Stored logs"
                      : report?.report_source === "llm"
                        ? "LLM"
                        : "Pending"
                  }
                />
              </div>

              <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
                <p>Terminate exam: <span className="text-white">{score?.should_terminate_exam ? "Yes" : "No"}</span></p>
                <p className="mt-2">Last event: <span className="text-white">{selectedStudent?.last_event || "No events yet"}</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Cheating Timeline</h2>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  minTickGap={32}
                  stroke="#94a3b8"
                  tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ background: "#020617", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)" }}
                  labelFormatter={(value) => formatDateTime(value)}
                />
                <Line dataKey="score_impact" dot={false} stroke="#22d3ee" strokeWidth={3} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Integrity Report</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-300">
            <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Summary</p>
              <p className="mt-2 text-white">{report?.summary || "No report yet."}</p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Explanation</p>
              <p className="mt-2">{report?.explanation || "No explanation yet."}</p>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Recommended Action</p>
              <p className="mt-2">{report?.recommended_action || "No action generated yet."}</p>
            </div>
          </div>
        </div>

        {error ? <div className="panel border-rose-400/20 bg-rose-500/10 text-sm text-rose-100">{error}</div> : null}
      </section>
    </div>
  )
}

function SummaryCard({ label, value, helper, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "border-rose-400/20 bg-rose-500/10"
      : "border-white/10 bg-white/5"

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 font-display text-3xl text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{helper}</p>
    </div>
  )
}

function MiniInfo({ label, value }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  )
}
