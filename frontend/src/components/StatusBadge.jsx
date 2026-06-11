import { cn, statusBadgeClasses, isLiveStatus, statusLabel, statusDotColor } from '../utils/helpers'

/** Status pill. Live states (Running / Preempted / Requeued) pulse.
 *  variant="dot" renders a borderless colored dot + label (editorial tables). */
export default function StatusBadge({ status, className, variant = 'pill' }) {
  const live = isLiveStatus(status)

  if (variant === 'dot') {
    const color = statusDotColor(status)
    return (
      <span className={cn('inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300', className)}>
        <span className="relative flex h-2 w-2">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: color }} />}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        </span>
        {statusLabel(status)}
      </span>
    )
  }

  return (
    <span className={cn('pill', statusBadgeClasses(status), className)}>
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {statusLabel(status)}
    </span>
  )
}
