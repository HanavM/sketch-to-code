const rows = [
  { name: 'Ana Ruiz', role: 'Design lead', status: 'Active', dot: '#22c55e' },
  { name: 'Ben Cole', role: 'Engineer', status: 'Active', dot: '#22c55e' },
  { name: 'Chi Ng', role: 'Engineer', status: 'Away', dot: '#f97316' },
  { name: 'Dev Patel', role: 'Product', status: 'Active', dot: '#22c55e' },
  { name: 'Eva Moss', role: 'Support', status: 'Off', dot: '#9ca3af' },
  { name: 'Finn Lee', role: 'Engineer', status: 'Active', dot: '#22c55e' },
]

const rowHeights = [80, 80, 80, 80, 80, 91]

export default function App() {
  return (
    <div className="h-[900px] w-full overflow-hidden bg-[#f8fafc] flex">
      <aside className="w-[220px] h-full bg-[#0f172a] flex-shrink-0 relative text-white">
        <div className="absolute left-6 top-[41px] font-bold text-lg tracking-tight">Northwind</div>
        <a className="absolute left-6 top-[102px] text-sm text-slate-300">Overview</a>
        <a className="absolute left-6 top-[141px] text-sm font-bold text-white">Team</a>
        <a className="absolute left-6 top-[180px] text-sm text-slate-300">Projects</a>
        <a className="absolute left-6 top-[219px] text-sm text-slate-300">Billing</a>
        <a className="absolute left-6 top-[258px] text-sm text-slate-300">Settings</a>
      </aside>

      <div className="relative flex-1">
        <button className="absolute left-[830px] top-[45px] w-[181px] h-[49px] rounded-md bg-[#4f46e5] text-white text-sm font-medium">
          + Invite member
        </button>

        <h1 className="absolute left-[50px] top-[28px] text-5xl font-bold text-slate-900">Team members</h1>
        <p className="absolute left-[50px] top-[119px] flex items-center gap-2 text-sm text-slate-500">
          <span>6 people</span>
          <span>4 active now</span>
        </p>

        <div className="absolute left-[49px] top-[169px] w-[961px] h-[562px] bg-white border border-[#e2e8f0] rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center h-[71px] px-10 border-b border-[#dfe3e8] text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div className="w-[340px]">Name</div>
            <div className="w-[260px]">Role</div>
            <div className="w-[220px]">Status</div>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.name}
              className={`flex items-center px-10 ${i < 5 ? 'border-b border-[#dfe3e8]' : ''}`}
              style={{ height: rowHeights[i] }}
            >
              <div className="flex items-center gap-4 w-[340px]">
                <div className="w-8 h-8 rounded-full bg-[#c7d2fe]" style={{ transform: 'rotate(-40deg)' }} />
                <span className="font-bold text-slate-900">{row.name}</span>
              </div>
              <div className="w-[260px] text-slate-600">{row.role}</div>
              <div className="flex items-center gap-2 w-[220px]">
                <span className="w-2 h-2 rounded-full" style={{ background: row.dot }} />
                <span className="font-bold" style={{ color: row.dot }}>{row.status}</span>
              </div>
              <div className="flex-1" />
              <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex flex-col items-center justify-center gap-[2px]">
                <span className="w-1 h-1 rounded-full bg-slate-400" />
                <span className="w-1 h-1 rounded-full bg-slate-400" />
                <span className="w-1 h-1 rounded-full bg-slate-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
