import { CheckCircle2, Layers, Loader2, XCircle } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import StatsCard from '../components/StatsCard'
import QualityCard from '../components/QualityCard'
import SlideTable from '../components/SlideTable'
import UploadZone from '../components/UploadZone'
import { APP_USER, PAGES } from '../utils/constants'
import { cn } from '../utils/helpers'

// Cohort-level treatment signal flags (mock — across completed slides).
const SIGNAL_BADGE = {
  green: 'bg-brand/10 text-brand-dark dark:text-brand-light',
  orange: 'bg-accent/10 text-accent-dark dark:text-accent',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  grey: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
}
const SIGNAL_BAR = { green: '#059669', orange: '#F97316', red: '#EF4444', grey: '#9CA3AF' }

const TREATMENT_SIGNALS = [
  { name: 'Checkpoint Inhibitor Candidate', count: 7, total: 11, tone: 'green' },
  { name: 'Immune Excluded Pattern', count: 4, total: 11, tone: 'orange' },
  { name: 'Low Chemo Sensitivity', count: 9, total: 11, tone: 'red' },
  { name: 'Anti-angiogenic Low Signal', count: 8, total: 11, tone: 'grey' },
]

// Completed slides by cancer type (mock).
const COHORT = [
  { name: 'Lung', value: 4, color: '#059669' },
  { name: 'Breast', value: 3, color: '#14B8A6' },
  { name: 'Pancreas', value: 2, color: '#F97316' },
  { name: 'Brain', value: 1, color: '#86EFAC' },
  { name: 'Other', value: 1, color: '#9CA3AF' },
]

function SignalRow({ name, count, total, tone }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{name}</span>
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', SIGNAL_BADGE[tone])}>{count} of {total} slides</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: SIGNAL_BAR[tone] }} />
      </div>
    </div>
  )
}

export default function DashboardPage({ slides, loading, stats, onNavigate, onViewSlide }) {
  const sampleQuality = slides.find((j) => j.quality?.slideQuality === 'Good')?.quality || slides[0]?.quality
  const recent = [...slides].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Good morning, {APP_USER.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{APP_USER.institution} · Virtual mIF analysis overview</p>
        </div>
      </div>

      {/* Row 1 — Stats */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <StatsCard icon={Layers} label="Total Slides" value={stats.total} tone="gray" loading={loading} />
        <StatsCard icon={CheckCircle2} label="Completed" value={stats.completed} tone="green" loading={loading} />
        <StatsCard icon={Loader2} label="Running" value={stats.running} tone="orange" loading={loading} />
        <StatsCard icon={XCircle} label="Failed" value={stats.failed} tone="red" loading={loading} />
      </div>

      {/* Row 2 — Recent Slides (full width) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">Recent Slides</h2>
          <button type="button" onClick={() => onNavigate(PAGES.HISTORY)} className="text-xs font-semibold text-brand hover:text-brand-dark">View all →</button>
        </div>
        <SlideTable slides={recent} loading={loading} pageSize={5} onView={onViewSlide} />
      </div>

      {/* Row 3 — Tissue Quality + Quick Upload (50/50, equal height) */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {sampleQuality && <QualityCard quality={sampleQuality} className="h-full" />}
        <div className="card flex h-full flex-col p-6">
          <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">Quick Upload</h3>
          <UploadZone compact onFileSelected={() => onNavigate(PAGES.UPLOAD)} />
        </div>
      </div>

      {/* Row 4 — Treatment Signals + Cohort Breakdown (50/50, equal height) */}
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
