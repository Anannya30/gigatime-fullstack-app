import { STATUS_META, STATUS_LABEL } from './constants'

/** Conditional className joiner (clsx-lite). */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function statusLabel(status) {
  return STATUS_LABEL[status] || status
}

/** Tailwind classes for a status pill given a slide status. */
export function statusBadgeClasses(status) {
  const tone = STATUS_META[status]?.tone || 'gray'
  const map = {
    green: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
    red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  }
  return map[tone] || map.gray
}

export function isLiveStatus(status) {
  return Boolean(STATUS_META[status]?.pulse)
}

/**
 * Confidence tier for a Positive Marker % value (0–100 scale) or insufficient
 * sample. Returns { label, classes, barColor }.
 */
export function confidenceTier(score, insufficient = false) {
  if (insufficient) {
    return {
      label: 'Insufficient Sample',
      classes: 'bg-gray-400/10 text-gray-500 border-gray-300 dark:border-gray-600 dark:text-gray-400',
      barColor: '#9CA3AF',
    }
  }
  if (score > 15)
    return { label: 'High', classes: 'bg-brand/10 text-brand-dark border-brand/20 dark:text-brand-light', barColor: '#059669' }
  if (score >= 5)
    return { label: 'Moderate', classes: 'bg-brand/10 text-brand-dark border-brand/20 dark:text-brand-light', barColor: '#10B981' }
  if (score >= 1)
    return { label: 'Low', classes: 'bg-accent/10 text-accent-dark border-accent/25 dark:text-accent', barColor: '#F97316' }
  return { label: 'Not Reliable', classes: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400', barColor: '#EF4444' }
}

/** Colour for a Positive Marker % bar by threshold (green >15 / orange 5–15 / red <5 / grey 0). */
export function scoreColor(score, insufficient = false) {
  if (insufficient || score == null || score === 0) return '#9CA3AF'
  if (score > 15) return '#059669'
  if (score >= 5) return '#F97316'
  return '#EF4444'
}

// --- date / number formatting ---------------------------------------------
export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '—'
  const diff = now - new Date(iso).getTime()
  if (Number.isNaN(diff)) return '—'
  const min = Math.round(diff / 60000)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 30) return `${day}d ago`
  return formatDate(iso)
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function seededRandom(seed, min = 0, max = 1) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const r = ((h >>> 0) % 100000) / 100000
  return min + r * (max - min)
}

export function roundTo(n, places = 2) {
  const f = 10 ** places
  return Math.round(n * f) / f
}

export function truncate(str, max = 18) {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max - 1)}…` : str
}

export function paginate(items, page, pageSize) {
  return items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
}
export function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize))
}
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}
