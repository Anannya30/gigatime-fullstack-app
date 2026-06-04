import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { cn, formatDate, paginate, pageCount } from '../utils/helpers'

const COLUMNS = ['Filename', 'Cancer Type', 'Status', 'Submitted', '']

/** Recent slides table (Filename · Cancer · Status · Submitted · View). */
export default function SlideTable({ slides, loading = false, pageSize = 5, onView }) {
  const [page, setPage] = useState(1)
  const pages = pageCount(slides.length, pageSize)
  const safePage = Math.min(page, pages)
  const rows = paginate(slides, safePage, pageSize)

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-widest text-gray-400">
              {COLUMNS.map((c, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-3">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                  {COLUMNS.map((c, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="skeleton h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-gray-400">No slides found.</td></tr>
            ) : (
              rows.map((slide, i) => (
                <tr key={slide.id} className={cn('border-t border-gray-100 transition-colors hover:bg-brand/5 dark:border-gray-800', i % 2 === 1 && 'bg-gray-50/60 dark:bg-gray-900/30')}>
                  <td className="max-w-[220px] px-4 py-3">
                    <span className="block truncate font-medium text-gray-900 dark:text-white" title={slide.filename}>{slide.filename}</span>
                    <span className="font-mono text-[11px] text-gray-400">{slide.id}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">{slide.cancerType}</td>
                  <td className="px-4 py-3"><StatusBadge status={slide.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(slide.submittedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => onView?.(slide)} className="text-sm font-semibold text-brand hover:text-brand-dark">View →</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && slides.length > pageSize && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <span className="text-xs text-gray-400">Page {safePage} of {pages} · {slides.length} slides</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="btn-ghost h-8 w-8 !px-0"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={safePage === pages} className="btn-ghost h-8 w-8 !px-0"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}
