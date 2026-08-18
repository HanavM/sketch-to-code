const schedule = [
  {
    title: 'Sprint planning',
    date: 'Mon 9:00',
    notes: ['Review last sprint burndown', 'Lock scope for the release', 'Assign an owner per epic'],
    assignees: ['MC', 'JP', 'SO'],
    more: 3,
  },
  {
    title: 'Design review',
    date: 'Wed 14:00',
    notes: ['Walk through the new dashboard', 'Collect feedback on the invite flow', 'Agree on ship criteria'],
    assignees: ['RK', 'MC', 'SO'],
    more: 3,
  },
  {
    title: 'Team retro',
    date: 'Fri 16:30',
    notes: ['What went well this week', 'What slowed the team down', 'Pick two actions for next week'],
    assignees: ['JP', 'RK', 'MC'],
    more: 3,
  },
]

const avatarColor = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-yellow-100 text-yellow-700']

export default function WeeklySchedule() {
  return (
    <section className="h-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm pt-6 -mt-5">
      <h2 className="text-base font-semibold text-gray-900">Weekly Schedule</h2>
      <div className="mt-4 space-y-4">
        {schedule.map((s) => (
          <article key={s.title} className="rounded-md border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium text-gray-900">{s.title}</h3>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {s.date}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {s.notes.map((n) => (
                <li key={n} className="flex items-start gap-2 text-sm text-gray-500">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                  {n}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center">
              <div className="flex -space-x-2">
                {s.assignees.map((a, i) => (
                  <span
                    key={a}
                    className={`flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-white text-xs font-medium ${avatarColor[i % avatarColor.length]}`}
                  >
                    {a}
                  </span>
                ))}
              </div>
              <span className="ml-2 text-xs font-medium text-gray-500">+{s.more}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
