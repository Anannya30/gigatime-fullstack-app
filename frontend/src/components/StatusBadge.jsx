import { cn, statusBadgeClasses, isLiveStatus, statusLabel } from '../utils/helpers'

/** Status pill. Live states (Running / Preempted / Requeued) pulse. */
export default function StatusBadge({ status, className }) {
  const live = isLiveStatus(status)
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
