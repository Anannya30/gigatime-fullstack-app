/**
 * Live "tiles processed" progress bar, themed to match the app (cream `#F0EBDB`
 * track, forest-green `bg-brand` fill, sage `#4E6659` caption). Driven by REAL
 * tile counts streamed from the WSI inference task over WebSocket + polling.
 * Renders nothing until progress is available (tilesTotal known).
 *
 * @param {{tilesDone:number, tilesTotal:number, pct?:number}} progress
 * @param {boolean} [compact]  thin variant for table rows
 * @param {string}  [label]    left caption for the full variant
 */
export default function TileProgressBar({ progress, compact = false, label = 'Tiles processed' }) {
  if (!progress || !progress.tilesTotal) return null
  const pct =
    progress.pct ??
    Math.min(100, Math.round((progress.tilesDone / progress.tilesTotal) * 100))
  const counts = `${progress.tilesDone.toLocaleString()} / ${progress.tilesTotal.toLocaleString()}`

  if (compact) {
    return (
      <div className="mt-1.5 w-full max-w-[220px]">
        <div className="h-1.5 overflow-hidden rounded-full bg-[#F0EBDB] dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-brand transition-all duration-700"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-medium text-[#4E6659] dark:text-brand-light">
          <span>{counts} tiles</span>
          <span>{pct}%</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-end justify-between">
        <span className="text-sm text-[#4E6659] dark:text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{counts}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#F0EBDB] dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-brand transition-all duration-700"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-brand">{pct}%</p>
    </div>
  )
}
