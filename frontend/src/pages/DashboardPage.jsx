import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import SlideTable from '../components/SlideTable'
import { PAGES, SLIDE_STATUS } from '../utils/constants'
import { statusLabel } from '../utils/helpers'

// Muted green / sage / amber palette for the cohort-breakdown pie (by cancer type).
const COHORT_COLORS = {
  Lung: '#2D6A4F',
  Breast: '#74A892',
  Pancreas: '#B45309',
  Brain: '#B7C9B5',
  Colon: '#7C9885',
  Other: '#B0A99A',
}

export default function DashboardPage({ user, slides, loading, error, onRetry, onNavigate, onViewSlide, onStopSlide, onDeleteSlide }) {
  const [query, setQuery] = useState('')
  const profile = user || {}
  const [statusFilter, setStatusFilter] = useState('all')
  const [tissueFilter, setTissueFilter] = useState('all')

  // Distinct values for the filter dropdowns, derived from the live slide list.
  const statuses = [...new Set(slides.map((s) => s.status))]
  const tissues = [...new Set(slides.map((s) => s.cancerType))]

  const filtered = [...slides]
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .filter((s) => (statusFilter === 'all' || s.status === statusFilter)
      && (tissueFilter === 'all' || s.cancerType === tissueFilter)
      && (!query || s.filename.toLowerCase().includes(query.toLowerCase())))
  // Show only the 10 most recent; the rest live on "My Slides".
  const recent = filtered.slice(0, 10)
  // Only treat the list as truly empty when the fetch succeeded — a failed load
  // is shown as an error+retry, not a misleading "No slides yet".
  const loadFailed = !loading && !!error && slides.length === 0
  const isEmpty = !loading && !error && slides.length === 0

  // Cohort breakdown derived from real completed slides, grouped by cancer type.
  const cohort = useMemo(() => {
    const counts = {}
    slides
      .filter((s) => s.status === SLIDE_STATUS.SUCCEEDED)
      .forEach((s) => {
        const type = s.cancerType || 'Other'
        counts[type] = (counts[type] || 0) + 1
      })
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: COHORT_COLORS[name] || COHORT_COLORS.Other,
    }))
  }, [slides])

  return (
    <div className="animate-fade-in space-y-8">
      {/* Greeting — eyebrow + heading + submit button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Overview</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Good morning, {profile.name}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{[profile.institution, 'Virtual mIF analysis overview'].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={() => onNavigate(PAGES.UPLOAD)} className="btn-primary px-5 py-2.5">
          + Submit new slide
        </button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search slides…"
          className="input min-w-[200px] flex-1 bg-white dark:bg-gray-900/60"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto bg-white dark:bg-gray-900/60">
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select value={tissueFilter} onChange={(e) => setTissueFilter(e.target.value)} className="input w-auto bg-white dark:bg-gray-900/60">
          <option value="all">All tissues</option>
          {tissues.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Recent Slides (full width) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">Recent Slides</h2>
          <button type="button" onClick={() => onNavigate(PAGES.HISTORY)} className="text-xs font-semibold text-brand hover:text-brand-dark">View all →</button>
        </div>
        {loadFailed ? (
          <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Couldn’t load your slides</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{error}</p>
            <button type="button" onClick={() => onRetry?.()} className="btn-primary mt-4 px-5 py-2.5">Retry</button>
          </div>
        ) : isEmpty ? (
          <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No slides yet — upload your first slide</p>
            <button type="button" onClick={() => onNavigate(PAGES.UPLOAD)} className="btn-primary mt-4 px-5 py-2.5">+ Submit new slide</button>
          </div>
        ) : (
          <SlideTable slides={recent} loading={loading} pageSize={10} onView={onViewSlide} onStop={onStopSlide} onDelete={onDeleteSlide} />
        )}
      </div>

      {/* Cohort Breakdown — derived from real completed slides, grouped by cancer type */}
      <div className="card flex flex-col p-6 lg:max-w-2xl">
        <h3 className="font-semibold text-gray-900 dark:text-white">Cohort Breakdown</h3>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Completed slides by cancer type</p>
        <div className="mt-4 flex flex-1 flex-col items-center justify-center">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={cohort} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                  {cohort.map((c) => <Cell key={c.name} fill={c.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid w-full grid-cols-2 gap-x-6 gap-y-2">
            {cohort.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="text-gray-600 dark:text-gray-300">{c.name}</span>
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
