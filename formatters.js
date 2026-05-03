export function formatDateTime(value) {
  if (!value) return "No data"
  return new Date(value).toLocaleString()
}

export function riskTone(riskLevel) {
  if (riskLevel === "HIGH") return "text-rose-200 bg-rose-500/20 border-rose-400/30"
  if (riskLevel === "MEDIUM") return "text-amber-100 bg-amber-400/20 border-amber-300/30"
  return "text-emerald-100 bg-emerald-500/20 border-emerald-400/30"
}

export function progressTone(score) {
  if (score >= 80) return "bg-rose-400"
  if (score >= 40) return "bg-amber-300"
  return "bg-emerald-400"
}
