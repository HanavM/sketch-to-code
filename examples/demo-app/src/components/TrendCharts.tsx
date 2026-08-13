import { useState } from 'react'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const labelledMonths = [0, 3, 6, 9, 11]

const currentColor = '#2563eb'
const previousColor = '#9ca3af'

type Series = { name: string; color: string; dashed?: boolean; values: number[] }

type Chart = {
  title: string
  caption: string
  ticks: number[]
  format: (v: number) => string
  series: Series[]
}

const charts: Chart[] = [
  {
    title: 'Conversion',
    caption: 'Last 12 months',
    ticks: [2, 4, 6, 8],
    format: (v) => `${v.toFixed(1)}%`,
    series: [
      {
        name: 'This year',
        color: currentColor,
        values: [7.4, 7.3, 7.0, 6.6, 6.1, 5.6, 5.2, 4.9, 4.8, 4.7, 4.7, 4.7],
      },
      {
        name: 'Last year',
        color: previousColor,
        dashed: true,
        values: [6.2, 5.9, 5.3, 4.6, 3.9, 3.4, 3.1, 2.9, 2.8, 2.8, 2.7, 2.7],
      },
    ],
  },
  {
    title: 'Active users',
    caption: 'Last 12 months',
    ticks: [2000, 3000, 4000],
    format: (v) => v.toLocaleString('en-US'),
    series: [
      {
        name: 'This year',
        color: currentColor,
        values: [3450, 3180, 2860, 2600, 2450, 2410, 2520, 2810, 3200, 3560, 3800, 3904],
      },
      {
        name: 'Last year',
        color: previousColor,
        dashed: true,
        values: [2900, 2680, 2450, 2300, 2240, 2230, 2260, 2340, 2500, 2720, 2950, 3120],
      },
    ],
  },
]

const W = 400
const H = 160
const PAD = { top: 10, right: 46, bottom: 26, left: 36 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom

const round = (n: number) => Math.round(n * 100) / 100

function smoothPath(points: Array<[number, number]>) {
  let d = `M ${points[0][0]} ${round(points[0][1])}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2[0])} ${round(p2[1])}`
  }
  return d
}

function ChartCard({ title, caption, ticks, format, series }: Chart) {
  const [active, setActive] = useState<number | null>(null)

  const min = ticks[0]
  const max = ticks[ticks.length - 1]
  const count = series[0].values.length
  const step = PW / (count - 1)

  const x = (i: number) => PAD.left + i * step
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * PH

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{caption}</p>
        </div>
        <ul className="flex shrink-0 flex-wrap items-center gap-3">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5 text-xs text-gray-600">
              <svg width="16" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="16"
                  y2="4"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '4 3' : undefined}
                />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          aria-hidden="true"
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={y(t)}
                x2={PAD.left + PW}
                y2={y(t)}
                stroke="#e5e7eb"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#6b7280">
                {format(t)}
              </text>
            </g>
          ))}

          {labelledMonths.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7280">
              {months[i]}
            </text>
          ))}

          {active !== null && (
            <line
              x1={x(active)}
              y1={PAD.top}
              x2={x(active)}
              y2={PAD.top + PH}
              stroke="#d1d5db"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {series.map((s) => {
            const points = s.values.map((v, i) => [x(i), y(v)] as [number, number])
            const last = points[points.length - 1]
            return (
              <g key={s.name}>
                <path
                  d={smoothPath(points)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={last[0]} cy={last[1]} r="4" fill={s.color} stroke="#ffffff" strokeWidth="2" />
                {active !== null && (
                  <circle
                    cx={points[active][0]}
                    cy={points[active][1]}
                    r="4"
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                )}
              </g>
            )
          })}

          <text
            x={PAD.left + PW + 8}
            y={y(series[0].values[count - 1]) + 3}
            fontSize="10"
            fontWeight="600"
            fill="#111827"
          >
            {format(series[0].values[count - 1])}
          </text>

          {months.map((m, i) => {
            const left = Math.max(PAD.left, x(i) - step / 2)
            const right = Math.min(PAD.left + PW, x(i) + step / 2)
            return (
              <rect
                key={m}
                x={left}
                y={PAD.top}
                width={right - left}
                height={PH}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
              />
            )
          })}
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${Math.min(Math.max((x(active) / W) * 100, 14), 86)}%` }}
          >
            <p className="font-medium text-gray-900">{months[active]}</p>
            {series.map((s) => (
              <p key={s.name} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-gray-600">
                <span
                  className="inline-block h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
                <span className="font-medium text-gray-900">{format(s.values[active])}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{`${title} — ${caption}`}</caption>
        <thead>
          <tr>
            <th>Month</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={m}>
              <td>{m}</td>
              {series.map((s) => (
                <td key={s.name}>{format(s.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function TrendCharts() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      {charts.map((c) => (
        <ChartCard key={c.title} {...c} />
      ))}
    </div>
  )
}
