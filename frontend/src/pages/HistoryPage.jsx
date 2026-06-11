import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, GitCompareArrows, Search } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { getSlideResults } from '../api/slidesApi'
import { CANCER_TYPES, SLIDE_STATUS } from '../utils/constants'
import { cn, formatDateTime, formatDuration, paginate, pageCount, scoreColor } from '../utils/helpers'

const PAGE_SIZE = 10
const EMPTY = { status: 'All', cancerType: 'All', filename: '', tag: '', dateFrom: '' }

export default function HistoryPage({ slides, loading, onView, onCompareSelected }) {
  const [filters, setFilters] = useState(EMPTY)
  const [sort, setSort] = useState({ key: 'submittedAt', dir: 'desc' })
  const [selected, setSelected] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(1)

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1) }

  const filtered = useMemo(() => {
    let list = slides.filter((j) => {
      if (filters.status !== 'All' && j.status !== filters.status) return false
      if (filters.cancerType !== 'All' && j.cancerType !== filters.cancerType) return false
      if (filters.filename && !j.filename.toLowerCase().includes(filters.filename.toLowerCase())) return false
      if (filters.tag && !(j.tags || []).some((t) => t.toLowerCase().includes(filters.tag.toLowerCase()))) return false
      if (filters.dateFrom && new Date(j.submittedAt) < new Date(filters.dateFrom)) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      let av = a[sort.key]
      let bv = b[sort.key]
      if (sort.key === 'submittedAt') { av = new Date(av).getTime(); bv = new Date(bv).getTime() }
      if (sort.key === 'duration') { av = av ?? -1; bv = bv ?? -1 }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return list
  }, [slides, filters, sort])

  const pages = pageCount(filtered.length, PAGE_SIZE)
  const safePage = Math.min(page, pages)
  const rows = paginate(filtered, safePage, PAGE_SIZE)

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const toggleSelect = (id) => {
    const slide = rows.find((r) => r.id === id)
    if (!slide || slide.status !== SLIDE_STATUS.SUCCEEDED) return
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  const pageIds = rows.filter((r) => r.status === SLIDE_STATUS.SUCCEEDED).map((r) => r.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const toggleSelectPage = () => setSelected((cur) => (allOnPage ? cur.filter((id) => !pageIds.includes(id)) : [...new Set([...cur, ...pageIds])]))

  const SortHeader = ({ label, sortKey }) => (
    <th className="px-4 py-3">
      <button type="button" onClick={() => toggleSort(sortKey)} className="inline-flex items-center gap-1 font-medium uppercase tracking-widest text-gray-400 hover:text-brand">
        {label}
        {sort.key === sortKey ? <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sort.dir === 'asc' && 'rotate-180')} /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">My Slides</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} of {slides.length} slides</p>
        </div>
        <button type="button" disabled={selected.length < 2 || selected.length > 3} onClick={() => onCompareSelected(selected)} className="btn-primary text-sm">
          <GitCompareArrows className="h-4 w-4" />
          Compare Selected{selected.length ? ` (${selected.length})` : ''}
        </button>
      </div>

      {/* Filters */}
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <label className="label">Filename</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={filters.filename} onChange={(e) => set({ filename: e.target.value })} className="input pl-8" placeholder="Search…" />
          </div>
        </div>
        <div>
          <label className="label">Status</label>
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })} className="input">
            <option>All</option>
            {Object.values(SLIDE_STATUS).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cancer Type</label>
          <select value={filters.cancerType} onChange={(e) => set({ cancerType: e.target.value })} className="input">
            <option>All</option>
            {CANCER_TYPES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tag</label>
          <input value={filters.tag} onChange={(e) => set({ tag: e.target.value })} className="input" placeholder="Tag…" />
        </div>
        <div>
          <label className="label">From date</label>
          <input type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className="input" />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="px-4 py-3"><input type="checkbox" checked={allOnPage} onChange={toggleSelectPage} className="h-4 w-4 accent-[#059669]" aria-label="Select page" /></th>
                <th className="w-8 px-2 py-3" />
                <SortHeader label="Filename" sortKey="filename" />
                <SortHeader label="Cancer" sortKey="cancerType" />
                <SortHeader label="Status" sortKey="status" />
                <SortHeader label="Submitted" sortKey="submittedAt" />
                <SortHeader label="Duration" sortKey="duration" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    {Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3.5"><div className="skeleton h-4 w-16" /></td>)}
                  </tr>
                ))
              ) : slides.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No slides yet — upload your first slide</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No slides match these filters.</td></tr>
              ) : (
                rows.map((slide) => (
                  <Row key={slide.id} slide={slide} selected={selected.includes(slide.id)} expanded={expanded === slide.id} onToggleSelect={() => toggleSelect(slide.id)} onToggleExpand={() => setExpanded((e) => (e === slide.id ? null : slide.id))} onView={() => onView(slide)} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-800">
            <span className="text-xs text-gray-400">Page {safePage} of {pages}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="btn-ghost h-8 w-8 !px-0"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage === pages} className="btn-ghost h-8 w-8 !px-0"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ slide, selected, expanded, onToggleSelect, onToggleExpand, onView }) {
  const selectable = slide.status === SLIDE_STATUS.SUCCEEDED
  const [top3, setTop3] = useState([])

  // Lazily fetch the real marker table the first time a completed row expands.
  useEffect(() => {
    if (!expanded || !selectable) return
    let active = true
    ;(async () => {
      try {
        const data = await getSlideResults(slide.id)
        const rows = (data?.marker_table || [])
          .map((m) => ({ name: m.marker, score: m.positive_pixel_pct }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
        if (active) setTop3(rows)
      } catch {
        if (active) setTop3([])
      }
    })()
    return () => {
      active = false
    }
  }, [expanded, selectable, slide.id])

  return (
    <>
      <tr className={cn('border-t border-gray-100 transition-colors dark:border-gray-800', selected ? 'bg-brand/5' : 'hover:bg-brand/5')}>
        <td className="px-4 py-3.5"><input type="checkbox" checked={selected} onChange={onToggleSelect} disabled={!selectable} className="h-4 w-4 accent-[#059669]" aria-label={`Select ${slide.filename}`} /></td>
        <td className="px-2 py-3.5"><button type="button" onClick={onToggleExpand} className="text-gray-400 hover:text-brand"><ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} /></button></td>
        <td className="max-w-[240px] px-4 py-3.5">
          <button type="button" onClick={onView} className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-brand dark:text-white" title={slide.filename}>{slide.filename}</button>
          <span className="font-mono text-[11px] text-gray-400">{slide.id}</span>
        </td>
        <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">{slide.cancerType}</td>
        <td className="px-4 py-3.5"><StatusBadge status={slide.status} /></td>
        <td className="whitespace-nowrap px-4 py-3.5 text-gray-500 dark:text-gray-400">{formatDateTime(slide.submittedAt)}</td>
        <td className="whitespace-nowrap px-4 py-3.5 text-gray-500 dark:text-gray-400">{formatDuration(slide.duration)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-900/40">
          <td colSpan={7} className="px-6 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Top 3 channels</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {top3.map((p) => (
                <div key={p.name} className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-900 dark:text-white">{p.name}</span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{p.score.toFixed(2)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.score)}%`, backgroundColor: scoreColor(p.score) }} />
                  </div>
                </div>
              ))}
            </div>
            {slide.tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {slide.tags.map((t) => <span key={t} className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-dark dark:text-brand-light">{t}</span>)}
              </div>
            )}
            <button type="button" onClick={onView} className="btn-secondary mt-3 text-xs">View results</button>
          </td>
        </tr>
      )}
    </>
  )
}
