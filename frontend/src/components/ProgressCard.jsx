import { useEffect, useState } from 'react'
import { Cpu, Gauge, Layers, Timer } from 'lucide-react'
import { cn, clamp } from '../utils/helpers'

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-[5px] border border-paper-line bg-paper px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}

/** Live processing panel; simulates inference progress via setInterval. */
export default function ProgressCard({ progress, live = false }) {
  const [state, setState] = useState(progress)
  useEffect(() => setState(progress), [progress])

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      setState((prev) => {
        if (!prev || prev.tilesProcessed >= prev.totalTiles) return prev
        const tilesProcessed = clamp(prev.tilesProcessed + Math.round(8 + Math.random() * 18), 0, prev.totalTiles)
        const remaining = prev.totalTiles - tilesProcessed
        const tilesPerSec = +(10 + Math.random() * 5).toFixed(1)
        const etaMinutes = Math.max(1, Math.ceil(remaining / tilesPerSec / 60))
        const batch = Math.floor(tilesProcessed / 128) + 1
        return { ...prev, tilesProcessed, tilesPerSec, etaMinutes, gpuUtil: clamp(Math.round(88 + Math.random() * 10), 0, 99), stage: remaining === 0 ? 'Finalizing output…' : `Running inference on batch ${batch}…` }
      })
    }, 1200)
    return () => clearInterval(id)
  }, [live])

  if (!state) return null
  const pct = state.totalTiles ? Math.round((state.tilesProcessed / state.totalTiles) * 100) : 0

  return (
    <div className="card flex h-full flex-col p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">Live Processing</h3>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          {state.stage}
        </span>
      </div>

      <div className="mb-1.5 flex items-end justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">Tiles processed</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {state.tilesProcessed.toLocaleString()} / {state.totalTiles.toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#F0EBDB] dark:bg-gray-700">
        <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-brand">{pct}%</p>

      <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
        <Stat icon={Timer} label="ETA" value={state.etaMinutes != null ? `~${state.etaMinutes} min` : '—'} />
        <Stat icon={Cpu} label="GPU util" value={`${state.gpuUtil}%`} />
        <Stat icon={Gauge} label="Tiles/sec" value={state.tilesPerSec || '—'} />
        <Stat icon={Layers} label="Progress" value={`${pct}%`} />
      </div>
    </div>
  )
}
