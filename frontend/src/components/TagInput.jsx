import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../utils/helpers'

/** Chip-style tag editor. Adds on Enter/comma; removes via × or Backspace. */
export default function TagInput({ tags = [], onChange, placeholder = 'Add a tag…', className }) {
  const [draft, setDraft] = useState('')

  function addTag(raw) {
    const value = raw.trim().replace(/,$/, '')
    if (!value) return
    if (!tags.includes(value)) onChange([...tags, value])
    setDraft('')
  }
  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 dark:border-gray-700 dark:bg-gray-900/60', className)}>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-brand/10 py-0.5 pl-2 pr-1 text-xs font-semibold text-brand-dark dark:text-brand-light">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="rounded p-0.5 hover:bg-brand/15" aria-label={`Remove ${tag}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(draft) }
          else if (e.key === 'Backspace' && !draft && tags.length) removeTag(tags[tags.length - 1])
        }}
        onBlur={() => draft && addTag(draft)}
        placeholder={tags.length ? '' : placeholder}
        className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
      />
    </div>
  )
}
