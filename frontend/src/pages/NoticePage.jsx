import { useState } from 'react'
import { Database, FileWarning, ShieldCheck, Timer, UserCheck } from 'lucide-react'
import { cn } from '../utils/helpers'

function Section({ icon: Icon, title, children }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{children}</p>
      </div>
    </div>
  )
}

export default function NoticePage({ onAccept, firstView = false }) {
  const [accepted, setAccepted] = useState(false)
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Privacy & Research Notice</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Please review before using GigaTIME.</p>
        </div>
      </div>

      <div className="card space-y-6 p-7">
        <div className="rounded-lg border border-accent/25 bg-accent/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-accent-dark dark:text-accent">
            <FileWarning className="h-5 w-5" />
            Research Use Only
          </div>
          <p className="mt-1.5 text-sm text-accent-dark/90 dark:text-accent/90">
            GigaTIME generates virtual multiplex immunofluorescence from H&E for research purposes only. Outputs are
            <strong> not intended for clinical care, diagnosis, or treatment decisions.</strong>
          </p>
        </div>

        <Section icon={Database} title="Data Handling">
          Uploaded slides are processed to generate virtual mIF predictions. Images and derived outputs are stored in your research workspace and are not shared with third parties.
        </Section>
        <Section icon={UserCheck} title="Consent Requirements">
          You must confirm appropriate patient consent has been obtained and that all slides are fully de-identified before upload. Do not upload any personally identifiable information.
        </Section>
        <Section icon={Timer} title="Data Retention">
          Slide records and outputs are retained for the duration of your project and may be deleted by you at any time. De-identified results may be retained in aggregate for model evaluation.
        </Section>

        <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors', accepted ? 'border-brand/40 bg-brand/5' : 'border-gray-200 dark:border-gray-700')}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#059669]" />
          <span className="text-sm text-gray-900 dark:text-white">
            I have read and agree to the research-use terms, and confirm all uploaded data is de-identified and consented.
          </span>
        </label>

        <button type="button" disabled={!accepted} onClick={onAccept} className="btn-primary w-full">
          {firstView ? 'Accept & Continue' : 'Save Acknowledgement'}
        </button>
      </div>
    </div>
  )
}
