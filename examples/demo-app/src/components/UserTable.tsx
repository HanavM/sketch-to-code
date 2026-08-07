const users = [
  { name: 'Maya Chen', role: 'Admin', status: 'Active' },
  { name: 'Jordan Patel', role: 'Editor', status: 'Active' },
  { name: 'Sam Okafor', role: 'Viewer', status: 'Invited' },
  { name: 'Riley Kim', role: 'Editor', status: 'Suspended' },
]

const statusColor: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Invited: 'bg-yellow-100 text-yellow-700',
  Suspended: 'bg-red-100 text-red-700',
}

export default function UserTable() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Team members</h2>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <th className="pb-2">Name</th>
            <th className="pb-2">Role</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.name} className="border-b border-gray-100 last:border-0">
              <td className="py-2.5 font-medium text-gray-900">{u.name}</td>
              <td className="py-2.5 text-gray-600">{u.role}</td>
              <td className="py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[u.status]}`}>
                  {u.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
