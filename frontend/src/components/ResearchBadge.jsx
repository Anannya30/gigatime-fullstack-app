import { cn } from '../utils/helpers'

/**
 * Persistent compliance badge shown on every page:
 * "RESEARCH USE ONLY — NOT FOR CLINICAL DIAGNOSIS".
 * Pass `full` to always show the long text; by default the long text is
 * revealed on wider screens and a short "Research Use Only" shows otherwise.
 */
export default function ResearchBadge({ className, full = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-dark dark:text-accent',
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      {full ? (
        'Research Use Only — Not for Clinical Diagnosis'
      ) : (
        <>
          <span className="lg:hidden">Research Use Only</span>
          <span className="hidden lg:inline">Research Use Only — Not for Clinical Diagnosis</span>
        </>
      )}
    </span>
  )
}
