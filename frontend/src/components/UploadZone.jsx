import { useRef, useState } from 'react'
import { CheckCircle2, FileImage, UploadCloud, X } from 'lucide-react'
import { cn, formatBytes } from '../utils/helpers'
import { SUPPORTED_FORMATS } from '../utils/constants'

function getFormat(filename) {
  const ext = filename.split('.').pop()?.toUpperCase()
  return SUPPORTED_FORMATS.includes(ext) ? ext : ext || 'FILE'
}
function estimateMinutes(bytes) {
  if (!bytes) return 8
  return Math.max(2, Math.round((bytes / 1_000_000_000) * 15))
}

/** Drag-and-drop slide upload zone (emits a file descriptor; no real upload). */
export default function UploadZone({ file, onFileSelected, onClear, compact = false }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFiles(fileList) {
    const f = fileList?.[0]
    if (!f) return
    onFileSelected({ filename: f.name, fileSize: f.size, format: getFormat(f.name), estimatedMinutes: estimateMinutes(f.size) })
  }

  if (file) {
    return (
      <div className="card flex items-center gap-4 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <FileImage className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold text-gray-900 dark:text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
            <span className="truncate">{file.filename}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatBytes(file.fileSize)}</span>
            <span className="rounded bg-gray-100 px-1.5 font-semibold dark:bg-gray-700">{file.format}</span>
            <span>~{file.estimatedMinutes} min processing</span>
          </p>
        </div>
        <button type="button" onClick={onClear} className="btn-ghost h-9 w-9 !px-0" aria-label="Remove file">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all duration-200',
        compact ? 'px-4 py-8' : 'px-6 py-12',
        dragging ? 'border-brand bg-brand/5 scale-[1.01]' : 'border-brand/40 hover:border-brand hover:bg-brand/5'
      )}
    >
      <input ref={inputRef} type="file" className="hidden" accept=".svs,.tiff,.tif,.png" onChange={(e) => handleFiles(e.target.files)} />
      <span className={cn('mb-3 flex items-center justify-center rounded-xl bg-brand/10 text-brand transition-transform duration-200', compact ? 'h-12 w-12' : 'h-14 w-14', dragging ? 'scale-110' : 'group-hover:scale-110')}>
        <UploadCloud className={compact ? 'h-6 w-6' : 'h-7 w-7'} />
      </span>
      <p className="font-semibold text-gray-900 dark:text-white">{dragging ? 'Drop your slide here' : 'Drop your slide here'}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        or <span className="font-semibold text-brand">browse files</span>
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {SUPPORTED_FORMATS.map((f) => (
          <span key={f} className="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">{f}</span>
        ))}
      </div>
    </div>
  )
}
