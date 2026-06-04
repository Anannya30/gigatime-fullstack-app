import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import { scoreColor } from '../utils/helpers'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lift dark:bg-gray-700">
      <p className="font-semibold">{row.name}</p>
      <p className="text-gray-300">{row.category}</p>
      <p className="mt-0.5 font-medium">Marker %: {row.insufficient ? 'N/A' : `${row.score.toFixed(2)}%`}</p>
    </div>
  )
}

/**
 * Horizontal bar chart of per-channel Positive Marker % (sorted high→low). Bars
 * are threshold-coloured; a dashed 15% reference line marks the High threshold;
 * insufficient channels (CD20) render grey with an "N/A" label.
 */
export default function PearsonOverviewChart({ data, title = 'Latest Run — Positive Marker % by Channel' }) {
  const renderLabel = (props) => {
    const { x, y, width, height, index } = props
    const row = data[index]
    return (
      <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={12} fontWeight={500} fill="#374151">
        {row.insufficient ? 'N/A' : `${row.score.toFixed(2)}%`}
      </text>
    )
  }

  return (
    <div className="card p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div style={{ height: data.length * 26 + 36 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 16, right: 44, left: 8, bottom: 0 }} barCategoryGap={6}>
            <XAxis type="number" domain={[0, 20]} hide />
            <YAxis type="category" dataKey="name" width={66} tickLine={false} axisLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
            <Tooltip cursor={{ fill: 'rgba(5,150,105,0.06)' }} content={<CustomTooltip />} />
            <ReferenceLine
              x={15}
              stroke="#9CA3AF"
              strokeDasharray="3 3"
              label={{ value: '15% threshold', position: 'top', fill: '#9CA3AF', fontSize: 11 }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive>
              {data.map((d) => (
                <Cell key={d.name} fill={scoreColor(d.score, d.insufficient)} />
              ))}
              <LabelList content={renderLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
