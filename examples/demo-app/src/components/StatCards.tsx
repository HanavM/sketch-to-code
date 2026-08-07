const stats = [
  { label: 'Revenue', value: '$48,210', delta: '+12.4%' },
  { label: 'Active users', value: '3,904', delta: '+3.1%' },
  { label: 'Conversion', value: '4.7%', delta: '-0.8%' },
]

export default function StatCards() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">{s.label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{s.value}</p>
          <p className={`mt-1 text-xs ${s.delta.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
            {s.delta} vs last month
          </p>
        </div>
      ))}
    </section>
  )
}
