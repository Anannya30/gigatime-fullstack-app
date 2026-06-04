import { Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '../utils/helpers'
import { SLIDE_STATUS, TIMELINE_STEPS } from '../utils/constants'

/**
 * Pipeline stepper: Created → Uploaded → Queued → Running → Succeeded.
 * Failed / Preempted / Requeued render as a special active node + message.
 */
export default function TimelineStepper({ status, errorMessage }) {
  const failed = status === SLIDE_STATUS.FAILED
  const preempted = status === SLIDE_STATUS.PREEMPTED
  const requeued = status === SLIDE_STATUS.REQUEUED
  const special = failed || preempted || requeued

  let activeIndex = TIMELINE_STEPS.indexOf(status)
  if (special) activeIndex = TIMELINE_STEPS.indexOf(SLIDE_STATUS.RUNNING)
  const tone = failed ? 'red' : preempted ? 'orange' : 'green'

  const message = failed
    ? errorMessage || 'Worker preempted — requeuing'
    : preempted
      ? 'Waiting for available GPU worker…'
      : requeued
        ? 'Slide requeued — waiting for a worker…'
        : null

  return (
    <div className="card p-6">
      <div className="flex items-center">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i < activeIndex || status === SLIDE_STATUS.SUCCEEDED
          const isActive = i === activeIndex && status !== SLIDE_STATUS.SUCCEEDED
          const runningActive = isActive && status === SLIDE_STATUS.RUNNING
          const specialActive = isActive && special
          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                    done && 'border-brand bg-brand text-white',
                    runningActive && 'border-brand bg-brand/10 text-brand animate-pulse',
                    specialActive && tone === 'red' && 'border-red-500 bg-red-500/10 text-red-500 animate-pulse',
                    specialActive && tone === 'orange' && 'border-accent bg-accent/10 text-accent animate-pulse',
                    !done && !isActive && 'border-gray-300 text-gray-400 dark:border-gray-600'
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : specialActive && tone === 'red' ? <X className="h-4 w-4" /> : specialActive ? <AlertTriangle className="h-4 w-4" /> : runningActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </span>
                <span className={cn('mt-2 text-[11px] font-semibold', done || isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400')}>
                  {specialActive ? status : step}
                </span>
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div className={cn('h-full rounded-full bg-brand transition-all duration-500', done ? 'w-full' : 'w-0')} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {message && (
        <div className={cn('mt-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm', tone === 'red' ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-accent/25 bg-accent/10 text-accent-dark dark:text-accent')}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}
