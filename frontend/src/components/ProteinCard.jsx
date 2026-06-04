import { cn, confidenceTier, scoreColor } from '../utils/helpers'

/**
 * Result card for one predicted protein channel.
 * CD20 (insufficient) is greyed with an "Insufficient Sample" badge + tooltip.
 */
export default function ProteinCard({ protein }) {
  const { name, category, color, score, insufficient } = protein
  const tier = confidenceTier(score, insufficient)
  const pct = score != null ? Math.min(100, score) : 0
  const bar = scoreColor(score, insufficient)
  // De-emphasize near-zero / unreliable channels so 0.00% values aren't over-read.
  const muted = insufficient || tier.label === 'Not Reliable'

  return (
    <div className={cn('group card flex h-full flex-col p-3 transition-all duration-200', muted ? 'opacity-60' : 'card-hover')}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <h4 className="text-sm font-bold leading-tight text-gray-900 dark:text-white">{name}</h4>
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            {category}
          </span>
        </div>
        <div className="relative shrink-0">
          <span className={cn('pill cursor-help px-2 py-0 text-[10px]', tier.classes)}>{tier.label}</span>
          {insufficient && (
            <span className="pointer-events-none absolute right-0 top-full z-10 mt-1.5 w-56 rounded-lg border border-gray-200 bg-white p-2.5 text-xs text-gray-600 opacity-0 shadow-lift transition-opacity duration-200 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              CD20 marks rare B cells. This sample did not contain enough CD20-positive cells to compute a reliable marker percentage.
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto pt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-gray-500 dark:text-gray-400">Marker %</span>
          <span className="font-bold text-gray-900 dark:text-white">{insufficient ? 'N/A' : `${score.toFixed(2)}%`}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: insufficient ? '100%' : `${pct}%`, backgroundColor: bar, opacity: insufficient ? 0.4 : 1 }} />
        </div>
      </div>
    </div>
  )
}
