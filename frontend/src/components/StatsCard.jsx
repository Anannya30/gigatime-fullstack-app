import { cn } from '../utils/helpers'

const ICON_TONES = {
  green: 'text-brand bg-brand/10',
  orange: 'text-accent bg-accent/10',
  red: 'text-red-500 bg-red-500/10',
  gray: 'text-gray-400 bg-gray-100 dark:bg-gray-700/50',
}

/** KPI card: small uppercase label, large bold number, subtle icon top-right. */
export default function StatsCard({ icon: Icon, label, value, tone = 'gray', loading = false }) {
  return (
    <div className="card-hover group p-6">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110', ICON_TONES[tone])}>
          {Icon && <Icon className="h-4 w-4" />}
        </span>
      </div>
      {loading ? (
        <div className="skeleton mt-4 h-10 w-16" />
      ) : (
        <div className="mt-3 text-4xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</div>
      )}
    </div>
  )
}
