import { useEffect, useRef, useState } from "react"
import { api } from "../lib/api"
import { formatDateTime } from "../lib/formatters"

export function StudentExamPanel({ session }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const dataRef = useRef(null)
  const streamRef = useRef(null)
  const audioAlertRef = useRef(null)

  const [status, setStatus] = useState("Preparing webcam...")
  const [lastAnalysis, setLastAnalysis] = useState(null)
  const [lastSubmittedAt, setLastSubmittedAt] = useState(null)
  const [tabSwitched, setTabSwitched] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState("")
  const scoreValue = lastAnalysis?.score ?? 0
  const riskLevel = lastAnalysis?.risk_level ?? "LOW"
  const statusTone =
    riskLevel === "HIGH"
      ? "border-rose-400/30 bg-rose-500/15 text-rose-100"
      : riskLevel === "MEDIUM"
        ? "border-amber-300/30 bg-amber-400/15 text-amber-50"
        : "border-emerald-400/30 bg-emerald-500/15 text-emerald-50"

  useEffect(() => {
    let mounted = true

    async function setupMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
          audio: true,
        })

        if (!mounted) return

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        const audioContext = new window.AudioContext()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        dataRef.current = new Uint8Array(analyser.frequencyBinCount)
        setStatus("Live monitoring started.")
      } catch (mediaError) {
        setError("Camera or microphone access was denied.")
        setStatus("Monitoring unavailable.")
      }
    }

    setupMedia()

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      audioContextRef.current?.close().catch(() => null)
    }
  }, [])

  useEffect(() => {
    audioAlertRef.current = new Audio("/alert.mp3")
    audioAlertRef.current.volume = 0.8
  }, [])

  const playAlertSound = () => {
    if (!audioAlertRef.current) return
    audioAlertRef.current.currentTime = 0
    audioAlertRef.current.play().catch(() => null)
  }

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitched(true)
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!analyserRef.current || !dataRef.current) return
      analyserRef.current.getByteFrequencyData(dataRef.current)
      const average = dataRef.current.reduce((sum, value) => sum + value, 0) / dataRef.current.length / 255
      setAudioLevel(Number(average.toFixed(2)))
    }, 700)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return

      const canvas = canvasRef.current
      const video = videoRef.current
      canvas.width = video.videoWidth || 960
      canvas.height = video.videoHeight || 540

      const context = canvas.getContext("2d")
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.8)

      try {
        const response = await api.analyzeFrame({
          student_id: session.user_id,
          image_base64: imageBase64,
          tab_switched: tabSwitched,
          audio_level: audioLevel,
          head_pose_offset: 0,
        })

        setLastAnalysis(response)
        setLastSubmittedAt(new Date().toISOString())
        setStatus(response.exam_active ? "Monitoring active." : "Exam terminated due to score threshold.")
        setTabSwitched(false)

        const shouldAlert =
          response.risk_level === "HIGH" ||
          (Array.isArray(response.events) &&
            response.events.some((eventName) => ["phone_detected", "multiple_faces"].includes(eventName)))

        if (shouldAlert) {
          playAlertSound()
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }, 2000)

    return () => window.clearInterval(interval)
  }, [audioLevel, session.user_id, tabSwitched])

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <section className="panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">Candidate Workspace</p>
            <h2 className="panel-title mt-2">Student Camera Feed</h2>
            <p className="mt-2 text-sm text-slate-300">Frames are captured every 2 seconds, scored server-side, and checked for suspicious behavior in real time.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`metric-pill border ${statusTone}`}>{riskLevel} risk</span>
            <span className="metric-pill border-cyan-400/20 bg-cyan-400/10 text-cyan-100">{status}</span>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80">
          <video autoPlay className="aspect-video w-full object-cover" muted playsInline ref={videoRef} />
          <canvas className="hidden" ref={canvasRef} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <Metric label="Last Upload" value={lastSubmittedAt ? formatDateTime(lastSubmittedAt) : "Pending"} />
          <Metric label="Audio Level" value={audioLevel.toFixed(2)} />
          <Metric label="Tab Switch Flag" value={tabSwitched ? "Detected" : "Clear"} />
          <Metric label="Live Score" value={`${scoreValue}/100`} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="panel">
          <h2 className="panel-title">Exam Health</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatusCard label="Student ID" value={session.user_id} />
            <StatusCard label="Live status" value={status} />
            <StatusCard label="Risk level" value={riskLevel} />
            <StatusCard label="Latest events" value={lastAnalysis?.events?.join(", ") || "No frames analyzed yet"} />
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Candidate Guidance</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>Stay centered in the frame and keep your face visible.</li>
            <li>Do not switch tabs or bring a phone into the camera view.</li>
            <li>Keep background noise low to avoid false voice alerts.</li>
            <li>Stay close enough to the camera so your face remains the dominant visible subject.</li>
          </ul>
        </div>

        <div className="panel">
          <h2 className="panel-title">Integrity Meter</h2>
          <div className="mt-4 h-3 rounded-full bg-slate-800">
            <div
              className={`h-3 rounded-full transition-all ${
                scoreValue >= 80 ? "bg-rose-400" : scoreValue >= 40 ? "bg-amber-300" : "bg-emerald-400"
              }`}
              style={{ width: `${scoreValue}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-slate-300">
            The score is based on face visibility, phone detection, tab switching, head movement, and audio spikes.
          </p>
        </div>

        {error ? <div className="panel border-rose-400/20 bg-rose-500/10 text-sm text-rose-100">{error}</div> : null}
      </section>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  )
}

function StatusCard({ label, value }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  )
}
