import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import SlideTable from '../components/SlideTable'
import { APP_USER, PAGES } from '../utils/constants'
import { cn, statusLabel } from '../utils/helpers'

// Cohort-level treatment signal flags (mock — across completed slides).
const SIGNAL_BADGE = {
  green: 'bg-brand/10 text-brand-dark dark:text-brand-light',
  orange: 'bg-accent/10 text-accent-dark dark:text-accent',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400',
  grey: 'bg-gray-200/70 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}
// Muted notebook palette for the progress bars.
const SIGNAL_BAR = { green: '#2D6A4F', orange: '#B45309', red: '#B91C1C', grey: '#A89F8D' }

const TREATMENT_SIGNALS = [
  { name: 'Checkpoint Inhibitor Candidate', count: 7, total: 11, tone: 'green' },
  { name: 'Immune Excluded Pattern', count: 4, total: 11, tone: 'orange' },
  { name: 'Low Chemo Sensitivity', count: 9, total: 11, tone: 'red' },
  { name: 'Anti-angiogenic Low Signal', count: 8, total: 11, tone: 'grey' },
]

// Completed slides by cancer type (mock) — muted green / sage / amber palette.
const COHORT = [
  { name: 'Lung', value: 4, color: '#2D6A4F' },
  { name: 'Breast', value: 3, color: '#74A892' },
  { name: 'Pancreas', value: 2, color: '#B45309' },
  { name: 'Brain', value: 1, color: '#B7C9B5' },
  { name: 'Other', value: 1, color: '#B0A99A' },
]

function SignalRow({ name, count, total, tone }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{name}</span>
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', SIGNAL_BADGE[tone])}>{count} of {total} slides</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-line dark:bg-gray-700">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: SIGNAL_BAR[tone] }} />
      </div>
    </div>
  )
}

export default function DashboardPage({ slides, loading, stats, onNavigate, onViewSlide }) {
  const [query, setQuery] = useState('')
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

  return (
    <div className="animate-fade-in space-y-8">
      {/* Greeting — eyebrow + heading + submit button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Overview</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Good morning, {APP_USER.name}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{APP_USER.institution} · Virtual mIF analysis overview</p>
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
        <SlideTable slides={recent} loading={loading} pageSize={10} onView={onViewSlide} />
      </div>

      {/* Bottom row — Treatment Signals + Cohort Breakdown (50/50, equal height) */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Treatment Signals Across Cohort */}
        <div className="card flex h-full flex-col p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white">Treatment Signals Across Cohort</h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Based on completed slides · Research use only</p>
          <div className="mt-5 space-y-4">
            {TREATMENT_SIGNALS.map((s) => <SignalRow key={s.name} {...s} />)}
          </div>
          <p className="mt-auto pt-5 text-xs italic text-gray-400">Signal flags are computational predictions from virtual mIF data. Not for clinical use.</p>
        </div>

        {/* Cohort Breakdown */}
        <div className="card flex h-full flex-col p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white">Cohort Breakdown</h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Completed slides by cancer type</p>
          <div className="mt-4 flex flex-1 flex-col items-center justify-center">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={COHORT} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                    {COHORT.map((c) => <Cell key={c.name} fill={c.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid w-full grid-cols-2 gap-x-6 gap-y-2">
              {COHORT.map((c) => (
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
    </div>
  )
}
