import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { formatDate, isStoppable, paginate, pageCount } from '../utils/helpers'

const COLUMNS = ['Filename', 'Cancer Type', 'Status', 'Submitted', '']

/** Recent slides table (Filename · Cancer · Status · Submitted · View). */
export default function SlideTable({ slides, loading = false, pageSize = 5, onView, onStop, onDelete }) {
  const [page, setPage] = useState(1)
  const pages = pageCount(slides.length, pageSize)
  const safePage = Math.min(page, pages)
  const rows = paginate(slides, safePage, pageSize)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paper-line text-left text-xs font-semibold uppercase tracking-widest text-gray-400 dark:border-gray-800">
              {COLUMNS.map((c, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i} className="border-b border-paper-line dark:border-gray-800">
                  {COLUMNS.map((c, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="skeleton h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-gray-400">No slides found.</td></tr>
            ) : (
              rows.map((slide) => (
                <tr key={slide.id} className="border-b border-paper-line transition-colors hover:bg-brand/[0.04] dark:border-gray-800">
                  <td className="max-w-[220px] px-4 py-4">
                    <span className="block truncate font-serif text-base font-bold text-gray-900 dark:text-white" title={slide.filename}>{slide.filename}</span>
                    <span className="font-mono text-[11px] text-gray-400">{slide.id}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-600 dark:text-gray-400">{slide.cancerType}</td>
                  <td className="px-4 py-4"><StatusBadge status={slide.status} variant="dot" /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-gray-500 dark:text-gray-400">{formatDate(slide.submittedAt)}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex items-center gap-4">
                      {onStop && isStoppable(slide.status) && (
                        <button type="button" onClick={() => onStop(slide)} className="text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400">Stop</button>
                      )}
                      {onDelete && (
                        <button type="button" onClick={() => onDelete(slide)} className="text-sm font-semibold text-gray-400 transition-colors hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400">Delete</button>
                      )}
                      <button type="button" onClick={() => onView?.(slide)} className="text-sm font-semibold text-brand hover:text-brand-dark">View →</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && slides.length > pageSize && (
        <div className="flex items-center justify-between border-t border-paper-line px-4 py-3 dark:border-gray-800">
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
