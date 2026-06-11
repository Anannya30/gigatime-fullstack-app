import { useRef, useState } from 'react'
import { CheckCircle2, FileImage, X } from 'lucide-react'
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

/** Text-focused editorial drop zone (emits a file descriptor; no real upload). */
export default function UploadZone({ file, onFileSelected, onClear }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFiles(fileList) {
    const f = fileList?.[0]
    if (!f) return
    onFileSelected({ filename: f.name, fileSize: f.size, format: getFormat(f.name), estimatedMinutes: estimateMinutes(f.size) })
  }

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-[5px] border border-[#D8D0C0] bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <span className="flex h-11 w-11 items-center justify-center rounded-[5px] bg-brand/10 text-brand">
          <FileImage className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold text-[#29241E] dark:text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
            <span className="truncate">{file.filename}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#928E82]">
            <span>{formatBytes(file.fileSize)}</span>
            <span className="rounded bg-paper px-1.5 font-semibold dark:bg-gray-700">{file.format}</span>
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
        'flex cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed px-6 py-16 text-center transition-colors',
        dragging ? 'border-brand bg-brand/[0.04]' : 'border-[#D8D0C0] bg-[#FFFFFA] hover:border-brand dark:border-gray-700 dark:bg-gray-800/40'
      )}
    >
      <input ref={inputRef} type="file" className="hidden" accept=".svs,.tiff,.tif,.png" onChange={(e) => handleFiles(e.target.files)} />
      <p className="font-serif text-[22px] font-bold text-[#41403B] dark:text-gray-100">Drop H&amp;E slide here</p>
      <p className="mt-2 text-sm text-[#4E6659] dark:text-brand-light">
        or <span className="underline-offset-2 hover:underline">browse files</span>
      </p>
      <p className="mt-4 text-xs tracking-wide text-[#A8A293]">{SUPPORTED_FORMATS.join(' · ')}</p>
    </div>
  )
}
