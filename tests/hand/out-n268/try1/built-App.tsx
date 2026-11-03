const filters = ['Fiction', 'History', 'Science', 'Kids']

const books = [
  { title: 'The Deep Blue', author: 'Mara Lind', status: 'Available', available: true, color: '#0f7490' },
  { title: 'Salt and Tide', author: 'J. Okafor', status: 'On loan', available: false, color: '#f59e0b' },
  { title: 'Night Swimmers', author: 'Ella Brandt', status: 'Available', available: true, color: '#7c3aed' },
  { title: 'Coral Atlas', author: 'Dr. R. Shah', status: 'Available', available: true, color: '#334155' },
]

export default function App() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-white box-border flex flex-col">
      <header
        className="h-[70px] shrink-0 flex items-center justify-between px-10"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <span className="text-xl font-bold text-slate-900">City Library</span>
        <nav className="flex items-center gap-3 text-sm text-slate-900">
          <a href="#" className="hover:underline">My loans</a>
          <span className="text-slate-400">·</span>
          <a href="#" className="hover:underline">Sign out</a>
        </nav>
      </header>

      <div className="mt-[29px] px-10 shrink-0 flex items-center gap-5">
        <input
          type="text"
          placeholder="Search books, authors, topics"
          className="flex-1 max-w-[900px] h-[58px] rounded-full border border-[#ccd5e1] bg-white px-6 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
        />
        <button className="h-[57px] w-[140px] shrink-0 rounded-full bg-[#2563eb] text-white text-sm font-bold">
          Search
        </button>
      </div>

      <div className="mt-[28px] px-10 shrink-0 flex items-center gap-3">
        <button className="h-[37px] px-5 rounded-full bg-[#1e293b] text-white text-sm font-bold">All</button>
        {filters.map((f) => (
          <button key={f} className="h-[37px] px-5 rounded-full bg-[#f1f4f8] text-slate-700 text-sm">
            {f}
          </button>
        ))}
      </div>

      <p className="mt-4 px-10 shrink-0 text-sm text-slate-500">128 results for "ocean"</p>

      <div className="mt-[29px] px-10 grid grid-cols-4 gap-7">
        {books.map((book) => (
          <div key={book.title}>
            <div className="h-[381px]" style={{ backgroundColor: book.color }} />
            <h3 className="mt-[13px] text-base font-bold text-slate-900">{book.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{book.author}</p>
            <span
              className={`mt-3 inline-block px-3 py-1 rounded-full text-xs font-semibold text-white ${
                book.available ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            >
              {book.status}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
