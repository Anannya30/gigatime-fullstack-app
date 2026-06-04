import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { cn } from '../utils/helpers'

function densityBadge(level) {
  const map = {
    High: 'bg-brand/10 text-brand-dark dark:text-brand-light',
    Medium: 'bg-accent/10 text-accent-dark dark:text-accent',
    Low: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return map[level] || map.Low
}
function qualityBadge(level) {
  const map = {
    Good: 'bg-brand/10 text-brand-dark border-brand/20 dark:text-brand-light',
    Fair: 'bg-accent/10 text-accent-dark border-accent/25 dark:text-accent',
    Poor: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  }
  return map[level] || map.Poor
}

function Metric({ label, value, suffix = '%' }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {typeof value === 'number' ? suffix : ''}
      </p>
    </div>
  )
}

/** Tissue quality card: coverage donut, metrics, poor-quality warning. */
export default function QualityCard({ quality, title = 'Tissue Quality Score', className }) {
  if (!quality) return null
  const { tissueCoverage, cellDensity, slideQuality, blurScore, stainingUniformity } = quality
  const poor = slideQuality === 'Poor' || tissueCoverage < 50
  const donut = [
    { name: 'Coverage', value: tissueCoverage },
    { name: 'Rest', value: 100 - tissueCoverage },
  ]

  return (
    <div className={cn('card p-6', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <span className={cn('pill', qualityBadge(slideQuality))}>{slideQuality}</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} dataKey="value" innerRadius={38} outerRadius={52} startAngle={90} endAngle={-270} stroke="none" paddingAngle={2}>
                <Cell fill="#059669" />
                <Cell fill="rgba(156,163,175,0.25)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{tissueCoverage}%</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Coverage</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Cell Density</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', densityBadge(cellDensity))}>{cellDensity}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Coverage" value={tissueCoverage} />
        <Metric label="Blur Score" value={blurScore} />
        <Metric label="Staining" value={stainingUniformity} />
      </div>

      {poor && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-3 text-sm text-accent-dark dark:text-accent">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Low tissue coverage may affect prediction accuracy.</span>
        </div>
      )}
    </div>
  )
}
