import { useState } from 'react'
import UploadZone from '../components/UploadZone'
import { PAGES } from '../utils/constants'

// Sage-green uppercase eyebrow label (matches the editorial inspiration).
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4D6558] dark:text-brand-light'
// White input, thin warm border, subtle ~5px radius, generous padding.
const INPUT =
  'w-full rounded-[5px] border border-[#D8D0C0] bg-white px-3.5 py-2.5 text-sm text-[#29241E] placeholder:text-[#A8A293] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'

function Field({ label, children }) {
  return (
    <div>
      <label className={`mb-2 block ${EYEBROW}`}>{label}</label>
      {children}
    </div>
  )
}

export default function UploadPage({ createSlide, onNavigate, onSlideCreated }) {
  const [file, setFile] = useState(null)
  const [meta, setMeta] = useState({ patientId: '', cancerType: '', specimen: '', histology: '', tissueOrigin: '' })
  const [uploading, setUploading] = useState(false)

  const [error, setError] = useState(null)
  const canSubmit = file?.raw && !uploading

  async function handleSubmit() {
    if (!canSubmit) return
    setUploading(true)
    setError(null)
    // Build a multipart payload for POST /api/slides/upload/. histology is
    // preserved as the slide note; tissue origin maps directly.
    const form = new FormData()
    form.append('file', file.raw)
    form.append('filename', file.filename)
    form.append('cancer_type', meta.cancerType || '')
    form.append('tissue_origin', meta.tissueOrigin || '')
    form.append('cohort_id', '')
    form.append('notes', meta.histology || '')
    form.append('tags', JSON.stringify([]))
    try {
      // createSlide uploads then auto-queues inference for the new slide.
      const slide = await createSlide(form)
      onSlideCreated?.(slide)
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      {/* Header */}
      <p className={EYEBROW}>Submission</p>
      <h1 className="mt-2 font-serif text-[34px] font-bold leading-tight text-[#29241E] dark:text-white">Upload a slide</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#928E82]">
        One patient&rsquo;s H&amp;E whole-slide image, submitted for virtual mIF prediction across 21 protein channels.
      </p>

      {/* Two columns separated by a thin warm divider */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.7fr_1fr]">
        {/* Left — dropzone + form */}
        <div className="space-y-6">
          <UploadZone file={file} onFileSelected={setFile} onClear={() => setFile(null)} />

          <Field label="Patient ID">
            <input className={INPUT} value={meta.patientId} onChange={(e) => setMeta({ ...meta, patientId: e.target.value })} placeholder="PT-…" />
          </Field>

          <Field label="Cancer Type">
            <input className={INPUT} value={meta.cancerType} onChange={(e) => setMeta({ ...meta, cancerType: e.target.value })} placeholder="e.g. Lung adenocarcinoma" />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Specimen">
              <input className={INPUT} value={meta.specimen} onChange={(e) => setMeta({ ...meta, specimen: e.target.value })} placeholder="slide_…" />
            </Field>
            <Field label="Histology">
              <input className={INPUT} value={meta.histology} onChange={(e) => setMeta({ ...meta, histology: e.target.value })} placeholder="Infiltrating duct carcinoma" />
            </Field>
          </div>

          <Field label="Tissue Origin">
            <input className={INPUT} value={meta.tissueOrigin} onChange={(e) => setMeta({ ...meta, tissueOrigin: e.target.value })} placeholder="Left breast, lower outer quadrant" />
          </Field>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="inline-flex items-center justify-center rounded-[5px] bg-[#356A58] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2c5a4a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? 'Submitting…' : 'Submit for analysis'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate(PAGES.DASHBOARD)}
              className="inline-flex items-center justify-center rounded-[5px] border border-[#4E6659] bg-transparent px-5 py-2.5 text-sm font-semibold text-[#4E6659] transition-colors hover:bg-[#4E6659]/5 dark:text-brand-light dark:hover:bg-brand/10"
            >
              Cancel
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Right — On submission */}
        <div className="lg:border-l lg:border-[#C5BEAC] lg:pl-8 dark:lg:border-gray-700">
          <h2 className="font-serif text-base font-bold text-[#433F34] dark:text-white">On submission</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#928E82]">
            The model tiles the slide and predicts 21 protein channels, then stitches them to a whole-slide virtual mIF.
          </p>
          <div className="mt-5 rounded-[5px] border border-[#E1D5C5] bg-[#F5F0DD] px-4 py-3.5 text-sm leading-relaxed text-[#8A7B5C] dark:border-gray-700 dark:bg-gray-800">
            <span className="font-bold text-[#8A7B5C] dark:text-amber-300">Processing time:</span> 20 minutes to 2 hours per slide. You may close the app after submitting &mdash; an email is sent when the result is ready.
          </div>
        </div>
      </div>
    </div>
  )
}
