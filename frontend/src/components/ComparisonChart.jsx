import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../hooks/useTheme'

// Series colours for up to 3 slides (green, orange, violet — on-palette + distinct).
const SERIES_COLORS = ['#059669', '#F97316', '#8B5CF6']

/**
 * Grouped bar chart comparing per-protein Positive Marker % across 2–3 slides.
 * @param {Array<{id, label, scores: Array<{name, score, insufficient}>}>} slides
 */
export default function ComparisonChart({ slides, proteins, action }) {
  const { isDark } = useTheme()
  if (!slides?.length) return null
  const names = proteins || slides[0].scores.map((s) => s.name)
  const data = names.map((name) => {
    const row = { protein: name }
    slides.forEach((slide) => {
      const match = slide.scores.find((s) => s.name === name)
      row[slide.label] = match && !match.insufficient ? match.score : 0
    })
    return row
  })

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Per-channel Positive Marker % comparison</h3>
        {action}
      </div>
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 60 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.15)" vertical={false} />
            <XAxis dataKey="protein" angle={-45} textAnchor="end" interval={0} height={70} tick={{ fill: '#6B7280', fontSize: 11 }} stroke="rgba(107,114,128,0.25)" />
            <YAxis domain={[0, 'auto']} tick={{ fill: '#6B7280', fontSize: 11 }} stroke="rgba(107,114,128,0.25)" />
            <Tooltip
              cursor={{ fill: 'rgba(5,150,105,0.06)' }}
              contentStyle={{
                background: isDark ? '#111827' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                borderRadius: 10,
                color: isDark ? '#FFFFFF' : '#0F172A',
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {slides.map((slide, i) => (
              <Bar key={slide.id} dataKey={slide.label} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={26} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
