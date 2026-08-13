const users = [
  { name: 'Maya Chen', role: 'Admin' },
  { name: 'Jordan Patel', role: 'Editor' },
  { name: 'Sam Okafor', role: 'Viewer' },
]

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
}

export default function UsersList() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Users</h2>
      <ul className="mt-4 divide-y divide-gray-100">
        {users.map((u) => (
          <li key={u.name} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
              {initials(u.name)}
            </span>
            <span className="text-sm font-medium text-gray-900">{u.name}</span>
            <span className="text-sm text-gray-500">{u.role}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
