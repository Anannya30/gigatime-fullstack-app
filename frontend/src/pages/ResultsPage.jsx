import { useMemo, useState } from 'react'
import { ChevronDown, Download, FileText } from 'lucide-react'
import ProgressCard from '../components/ProgressCard'
import ProteinCard from '../components/ProteinCard'
import StatusBadge from '../components/StatusBadge'
import { generateProteinScores } from '../data/mockProteins'
import { DEFAULT_PREVIEW_PROTEINS, SLIDE_STATUS, PAGES, PROTEIN_CATEGORIES, PROTEIN_COLORS } from '../utils/constants'
import { cn, statusLabel } from '../utils/helpers'
import {
  deriveImmunePhenotype,
  deriveCheckpointSignal,
  PHENOTYPE_BANNER,
  EVIDENCE_META,
  PDL1_POSITIVE_THRESHOLD,
} from '../utils/clinical'

const PREVIEW_PROTEINS = ['DAPI', 'CD3', 'CD8', 'PD-L1', 'CK', 'CD68']

const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(2)}%`)

function MetaItem({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{value || '—'}</dd>
    </div>
  )
}

function MifPreview() {
  const [selected, setSelected] = useState(DEFAULT_PREVIEW_PROTEINS)
  const toggle = (p) => setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  const overlay = selected
    .map((p, i) => {
      const c = PROTEIN_COLORS[p]
      const pos = ['20% 30%', '70% 25%', '40% 70%', '80% 65%', '30% 50%', '60% 50%'][i % 6]
      return `radial-gradient(circle at ${pos}, ${c}aa, transparent 35%)`
    })
    .join(', ')

  return (
    <div className="card flex h-full flex-col p-6">
      <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">Virtual mIF Preview</h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Visual evidence — toggle channels to inspect spatial protein distribution.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {PREVIEW_PROTEINS.map((p) => {
          const active = selected.includes(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200', active ? 'text-white' : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400')}
              style={active ? { backgroundColor: PROTEIN_COLORS[p], borderColor: PROTEIN_COLORS[p], boxShadow: `0 0 14px -2px ${PROTEIN_COLORS[p]}` } : undefined}
            >
              {p}
            </button>
          )
        })}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <figure className="flex flex-col">
          <div className="relative min-h-56 flex-1 overflow-hidden rounded-lg" style={{ background: 'radial-gradient(circle at 30% 30%, #e9a5c0, transparent 45%), radial-gradient(circle at 70% 60%, #c98bb4, transparent 50%), linear-gradient(135deg, #f0d9e6, #d6a9c6)' }}>
            <div className="absolute inset-0 opacity-40 mix-blend-multiply [background-image:radial-gradient(circle,_#7a3b63_0.6px,_transparent_1.4px)] [background-size:9px_9px]" />
          </div>
          <figcaption className="mt-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">H&amp;E Input</figcaption>
        </figure>
        <figure className="flex flex-col">
          <div className="relative min-h-56 flex-1 overflow-hidden rounded-lg bg-gray-900">
            <div className="absolute inset-0 transition-all duration-500" style={{ background: overlay || 'transparent' }} />
            <div className="absolute inset-0 opacity-20 mix-blend-screen [background-image:radial-gradient(circle,_#fff_0.5px,_transparent_1.2px)] [background-size:8px_8px]" />
          </div>
          <figcaption className="mt-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Virtual mIF Output</figcaption>
        </figure>
      </div>

      <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
        Showing: <span className="font-semibold text-brand">{selected.length ? selected.join(' + ') : 'none'}</span>
      </p>
    </div>
  )
}

/** Download / Export tiles — sized to match a protein card exactly within the grid. */
function ActionTile({ icon: Icon, label, variant, onClick }) {
  const base = 'flex h-full min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl p-3 text-center text-sm font-semibold transition-all duration-200 active:scale-[0.98]'
  const styles =
    variant === 'primary'
      ? 'bg-brand text-white shadow-sm hover:bg-brand-dark'
      : 'border-2 border-brand text-brand hover:bg-brand/10 dark:text-brand-light'
  return (
    <button type="button" onClick={onClick} className={cn(base, styles)}>
      <Icon className="h-5 w-5" />
      <span className="leading-tight">{label}</span>
    </button>
  )
}

function Finding({ tone, children }) {
  const dot = { green: 'bg-brand', orange: 'bg-accent', red: 'bg-red-500', gray: 'bg-gray-400' }[tone]
  return (
    <li className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot)} />
      <span>{children}</span>
    </li>
  )
}

/** Evidence-confidence tag: how strongly the literature backs a signal. */
function EvidenceTag({ level }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', EVIDENCE_META[level])} title="Strength of evidence behind this signal">
      {level}
    </span>
  )
}

function TreatmentFlag({ tone, title, detail, confidence }) {
  const pill = {
    green: 'bg-brand/10 text-brand-dark dark:text-brand-light',
    orange: 'bg-accent/10 text-accent-dark dark:text-accent',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  }[tone]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('pill', pill)}>{title}</span>
        {confidence && <EvidenceTag level={confidence} />}
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  )
}

function TmeRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-right font-semibold text-gray-900 dark:text-white">{value}</dd>
    </div>
  )
}

/** Headline clinical interpretation: TME phenotype banner + three columns. */
function ClinicalSummary({ phenotype, checkpoint, findings, treatments, pdl1, pdl1Positive, cd8Total, macrophage }) {
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Clinical Summary</h3>
        <span className="pill bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">AI Generated · For Research Use Only</span>
      </div>

      {/* TME phenotype banner */}
      <div className={cn('mt-4 rounded-xl border p-5', PHENOTYPE_BANNER[phenotype.tone])}>
        <span className="text-[11px] font-bold uppercase tracking-wide opacity-70">Tumor Immune Phenotype</span>
        <p className="mt-0.5 text-xl font-bold leading-tight sm:text-2xl">{phenotype.label}</p>
        <p className="mt-1.5 text-sm opacity-90">{phenotype.definition}</p>
        {phenotype.note && <p className="mt-2 text-xs italic opacity-80">{phenotype.note}</p>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Key Findings */}
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Key Findings</h4>
          <ul className="space-y-2.5">
            {findings.map((f, i) => <Finding key={i} tone={f.tone}>{f.text}</Finding>)}
          </ul>
        </div>

        {/* Tumor Microenvironment */}
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tumor Microenvironment</h4>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Spatial immune readout</p>
          <dl className="mt-2.5 space-y-1.5 text-xs">
            {phenotype.spatial ? (
              <>
                <TmeRow label="CD8 in tumor core" value={fmtPct(phenotype.cd8_intratumoral)} />
                <TmeRow label="CD8 in stroma" value={fmtPct(phenotype.cd8_stromal)} />
              </>
            ) : (
              <TmeRow label="CD8 (whole-slide)" value={fmtPct(cd8Total)} />
            )}
            <TmeRow label="PD-L1 status" value={pdl1Positive ? `Positive (${fmtPct(pdl1)})` : `Low (${fmtPct(pdl1)})`} />
            <TmeRow label="Macrophage presence" value={macrophage} />
          </dl>
          {!phenotype.spatial && (
            <p className="mt-3 text-xs italic text-gray-400">
              {phenotype.note || 'Tumor-core vs stromal CD8 quantification not available for this slide.'}
            </p>
          )}
        </div>

        {/* Potential Treatment Relevance */}
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Potential Treatment Relevance</h4>
          <p className="mb-3 text-xs italic text-gray-400">For research purposes only. Not for clinical decision making.</p>
          <div className="space-y-3.5">
            <TreatmentFlag tone={checkpoint.tone} title={checkpoint.title} detail={checkpoint.detail} confidence={checkpoint.confidence} />
            {treatments.map((t, i) => <TreatmentFlag key={i} {...t} />)}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Summary generated from virtual mIF protein expression data. All findings are computational predictions and must be validated by a certified pathologist before clinical use.
        </p>
      </div>
    </div>
  )
}

export default function ResultsPage({ slide, onNavigate, onToast }) {
  const [category, setCategory] = useState('All')
  const [procOpen, setProcOpen] = useState(false)
  const [channelsOpen, setChannelsOpen] = useState(false)
  const proteins = useMemo(() => (slide ? generateProteinScores(slide.id) : []), [slide])

  // --- Derive clinical interpretation (memoized) ---------------------------
  const interp = useMemo(() => {
    const pv = (n) => {
      const p = proteins.find((x) => x.name === n)
      return p ? (p.score ?? null) : null
    }
    // Defensive read: use spatial CD8 if the backend ever provides it.
    const spatial = slide?.spatialCd8 || slide?.spatial || null
    const cd8Intratumoral = spatial?.intratumoral ?? spatial?.cd8_intratumoral ?? null
    const cd8Stromal = spatial?.stromal ?? spatial?.cd8_stromal ?? null
    const cd8Total = pv('CD8')
    const pdl1 = pv('PD-L1')
    const pdl1Positive = pdl1 != null && pdl1 > PDL1_POSITIVE_THRESHOLD

    const phenotype = deriveImmunePhenotype(cd8Intratumoral, cd8Stromal, cd8Total)
    const checkpoint = deriveCheckpointSignal(phenotype, pdl1Positive, cd8Intratumoral)

    const ki67 = pv('Ki67')
    const cd34 = pv('CD34')
    const casp = pv('Caspase3-D')
    const cd68 = pv('CD68')
    const macrophage = cd68 == null ? '—' : cd68 >= 5 ? 'Moderate–High' : cd68 >= 1 ? 'Low–Moderate' : 'Minimal'

    // Key findings — hedged, derived from the data that is actually present.
    const findings = []
    if (pdl1Positive) findings.push({ tone: 'orange', text: `PD-L1 expression is positive (${fmtPct(pdl1)}) — relevant to immunotherapy, pending spatial context.` })
    else if (pdl1 != null) findings.push({ tone: 'gray', text: `PD-L1 expression is low (${fmtPct(pdl1)}).` })
    if (phenotype.key === 'inflamed') findings.push({ tone: 'green', text: 'Cytotoxic T cells detected within the tumor — an immunologically active microenvironment.' })
    else findings.push({ tone: 'orange', text: `Low cytotoxic T-cell signal (CD8 ${fmtPct(cd8Total)}); ${phenotype.spatial ? phenotype.label.toLowerCase() : 'spatial subtype indeterminate without tumor-core data'}.` })
    if (casp != null && casp >= 10) findings.push({ tone: 'green', text: `Elevated apoptosis marker (Caspase3-D ${fmtPct(casp)}) suggests active programmed cell death.` })
    if (cd34 != null && cd34 < 1) findings.push({ tone: 'red', text: `Minimal vasculature signal (CD34 ${fmtPct(cd34)}) suggests low angiogenic activity.` })

    // Non-checkpoint treatment signals — computational inferences → "Hypothesis".
    const treatments = []
    if (ki67 != null && ki67 < 5)
      treatments.push({ tone: 'orange', title: 'Low Proliferation Rate', confidence: 'Hypothesis', detail: `Low Ki67 signal (${fmtPct(ki67)}) is consistent with a slowly proliferating tumor, which may correlate with reduced response to cytotoxic chemotherapy.` })
    else if (ki67 != null)
      treatments.push({ tone: 'green', title: 'Active Proliferation', confidence: 'Hypothesis', detail: `Detectable Ki67 signal (${fmtPct(ki67)}) indicates ongoing tumor cell division.` })
    if (cd34 != null && cd34 < 1)
      treatments.push({ tone: 'gray', title: 'Anti-angiogenic — Low Signal', confidence: 'Hypothesis', detail: `Minimal CD34 vasculature signal (${fmtPct(cd34)}) offers little rationale for anti-angiogenic strategies.` })

    return { phenotype, checkpoint, findings, treatments, pdl1, pdl1Positive, cd8Total, macrophage }
  }, [proteins, slide])

  if (!slide) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center animate-fade-in">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">No slide selected</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Choose a slide from your history to view its virtual mIF results.</p>
        <button type="button" onClick={() => onNavigate(PAGES.HISTORY)} className="btn-primary mt-5">Go to My Slides</button>
      </div>
    )
  }

  const isRunning = slide.status === SLIDE_STATUS.RUNNING
  const filtered = category === 'All' ? proteins : proteins.filter((p) => p.category === category)
  const mockDownload = (what) => onToast?.(`${what} — download started (mock)`)
  const statusLine = slide.errorMessage || slide.progress?.stage || statusLabel(slide.status)

  return (
    <div className="animate-fade-in space-y-6">
      {/* 1 — Slim metadata bar */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-gray-900 dark:text-white">{slide.filename}</h1>
              <StatusBadge status={slide.status} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-gray-400">{slide.id}</p>
          </div>
          <span className="rounded-md bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark dark:text-brand-light">{slide.cancerType}</span>
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
          <MetaItem label="Tissue Origin" value={slide.tissueOrigin} />
          <MetaItem label="Cohort" value={slide.cohortId} />
          <MetaItem label="Status" value={slide.status} />
        </dl>
      </div>

      {/* 2 — Clinical Summary headline */}
      <ClinicalSummary {...interp} />

      {/* 3 — Virtual mIF Preview (visual evidence) */}
      <MifPreview />

      {/* 4 — Compact status line + Processing details accordion */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <StatusBadge status={slide.status} />
            <span className={cn('truncate text-sm', slide.errorMessage ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}>{statusLine}</span>
          </div>
          <button type="button" onClick={() => setProcOpen((o) => !o)} aria-expanded={procOpen} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark">
            Processing details
            <ChevronDown className={cn('h-4 w-4 transition-transform', procOpen && 'rotate-180')} />
          </button>
        </div>
        {procOpen && (
          <div className="border-t border-gray-100 p-5 dark:border-gray-800">
            <ProgressCard progress={slide.progress} live={isRunning} />
          </div>
        )}
      </div>

      {/* 5 — All protein channels (reference), collapsible, closed by default */}
      <div className="card overflow-hidden">
        <button type="button" onClick={() => setChannelsOpen((o) => !o)} aria-expanded={channelsOpen} className="flex w-full items-center justify-between gap-3 p-5 text-left">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">All protein channels (reference)</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">21 predicted channels · expand for the full marker table and exports</p>
          </div>
          <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-400 transition-transform', channelsOpen && 'rotate-180')} />
        </button>
        {channelsOpen && (
          <div className="border-t border-gray-100 p-5 dark:border-gray-800">
            <p className="mb-4 text-xs italic text-gray-400">Marker % values shown for demonstration using validation data. Near-zero channels are de-emphasized and should not be over-read as findings.</p>

            <div className="flex flex-wrap gap-2">
              {PROTEIN_CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150', category === c ? 'border-brand bg-brand/10 text-brand-dark dark:text-brand-light' : 'border-gray-200 text-gray-500 hover:border-brand hover:text-brand dark:border-gray-700 dark:text-gray-400')}>{c}</button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {filtered.map((p) => <ProteinCard key={p.name} protein={p} />)}
              <ActionTile icon={Download} label="Download OME-TIFF" variant="primary" onClick={() => mockDownload('OME-TIFF')} />
              <ActionTile icon={FileText} label="Export Summary PDF" variant="outline" onClick={() => mockDownload('Summary PDF')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
