import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Loader2, Play } from 'lucide-react'
import UploadZone from '../components/UploadZone'
import QualityCard from '../components/QualityCard'
import TagInput from '../components/TagInput'
import { CANCER_TYPES, PAGES } from '../utils/constants'
import { seededRandom } from '../utils/helpers'

function previewQuality(filename) {
  const coverage = Math.round(seededRandom(filename + 'cov', 38, 90))
  const blur = Math.round(seededRandom(filename + 'blur', 6, 55))
  const density = coverage > 74 ? 'High' : coverage > 55 ? 'Medium' : 'Low'
  const slide = coverage > 70 && blur < 30 ? 'Good' : coverage > 50 ? 'Fair' : 'Poor'
  return {
    tissueCoverage: coverage,
    cellDensity: density,
    slideQuality: slide,
    estimatedCellCount: Math.round(seededRandom(filename + 'cells', 80_000, 520_000)),
    blurScore: blur,
    stainingUniformity: Math.round(seededRandom(filename + 'uni', 55, 94)),
  }
}

export default function UploadPage({ createSlide, onNavigate, onSlideCreated }) {
  const [file, setFile] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [quality, setQuality] = useState(null)
  const [meta, setMeta] = useState({ cancerType: 'Lung', tissueOrigin: '', cohortId: '', notes: '', tags: [] })
  const [consent, setConsent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)

  // Animated "analyzing" → results when a file is selected.
  useEffect(() => {
    if (!file) {
      setQuality(null)
      setAnalyzing(false)
      return
    }
    setAnalyzing(true)
    setQuality(null)
    const id = setTimeout(() => {
      setQuality(previewQuality(file.filename))
      setAnalyzing(false)
    }, 1600)
    return () => clearTimeout(id)
  }, [file])

  const canRun = file && consent && !analyzing && !uploading

  useEffect(() => {
    if (!uploading) return
    const id = setInterval(() => setPct((p) => (p >= 100 ? 100 : Math.min(100, p + Math.round(4 + Math.random() * 12)))), 280)
    return () => clearInterval(id)
  }, [uploading])

  useEffect(() => {
    if (uploading && pct >= 100) {
      ;(async () => {
        const slide = await createSlide({ ...file, ...meta, quality })
        setUploading(false)
        setPct(0)
        onSlideCreated?.(slide)
      })()
    }
  }, [pct, uploading]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
        <button type="button" onClick={() => onNavigate(PAGES.DASHBOARD)} className="hover:text-brand">Dashboard</button>
        <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-gray-900 dark:text-white">Upload Slide</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Upload Slide</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Submit a whole-slide H&E image to generate virtual mIF.</p>
      </div>

      <UploadZone file={file} onFileSelected={setFile} onClear={() => setFile(null)} />

      {file && (
        <>
          {/* Tissue quality preview (analyzing → results) */}
          {analyzing ? (
            <div className="card flex items-center gap-3 p-6 text-sm text-gray-600 dark:text-gray-300">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              Analyzing tissue quality…
            </div>
          ) : (
            quality && <QualityCard quality={quality} title="Tissue Quality Preview" />
          )}

          {/* Annotation */}
          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Annotation</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Cancer Type</label>
                <select value={meta.cancerType} onChange={(e) => setMeta({ ...meta, cancerType: e.target.value })} className="input">
                  {CANCER_TYPES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tissue Origin</label>
                <input value={meta.tissueOrigin} onChange={(e) => setMeta({ ...meta, tissueOrigin: e.target.value })} className="input" placeholder="e.g. Left upper lobe" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Patient Cohort</label>
                <input value={meta.cohortId} onChange={(e) => setMeta({ ...meta, cohortId: e.target.value })} className="input" placeholder="e.g. COHORT-LUNG-2026" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} rows={3} className="input resize-none" placeholder="Optional notes about this sample…" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Tags</label>
                <TagInput tags={meta.tags} onChange={(tags) => setMeta({ ...meta, tags })} placeholder="Add tag and press Enter…" />
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-xs text-accent-dark dark:text-accent">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Do not enter patient names or personally identifiable information.</span>
            </div>
          </div>

          {/* Consent + run */}
          <label className="card flex cursor-pointer items-start gap-3 p-4 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#059669]" />
            <span>I confirm this slide is for <strong>research use only</strong>, patient consent has been obtained, and the slide has been de-identified.</span>
          </label>

          {uploading ? (
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900 dark:text-white">Uploading & queuing…</span>
                <span className="font-bold text-brand">{pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : (
            <button type="button" disabled={!canRun} onClick={() => { setPct(0); setUploading(true) }} className="btn-primary w-full">
              <Play className="h-4 w-4" />
              Run GigaTIME
            </button>
          )}
        </>
      )}
    </div>
  )
}
