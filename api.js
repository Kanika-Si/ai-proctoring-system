const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1"
const STORAGE_KEY = "smart-proctoring-session-v2"
const AUTH_EXPIRED_EVENT = "smart-proctoring-auth-expired"

function getStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
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

function normalizeErrorDetail(detail) {
  if (!detail) return "Request failed"
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item
        if (item?.msg) return item.msg
        return JSON.stringify(item)
      })
      .join(", ")
  }
  if (typeof detail === "object") {
    if (detail.msg) return detail.msg
    return JSON.stringify(detail)
  }
  return String(detail)
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Request failed" }))
    throw new Error(normalizeErrorDetail(payload.detail))
  }

  return response.json()
}

export const api = {
  login: (payload) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  analyzeFrame: (payload) =>
    request("/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getStudents: () => request("/students"),
  getStudent: (studentId) => request(`/students/${studentId}`),
  getAlerts: (studentId) => request(`/alerts?limit=20${studentId ? `&student_id=${studentId}` : ""}`),
  getTimeline: (studentId) => request(`/timeline?student_id=${studentId}&limit=24`),
  getScore: (studentId) => request(`/score?student_id=${studentId}`),
  getReport: (studentId) => request(`/report?student_id=${studentId}`),
}

export { AUTH_EXPIRED_EVENT }
