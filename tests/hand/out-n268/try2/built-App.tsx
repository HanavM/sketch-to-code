import BookCover from './components/BookCover'
import BookCover2 from './components/BookCover2'
import BookCover3 from './components/BookCover3'
import BookCover4 from './components/BookCover4'

const chips = [
  { label: 'All', active: true },
  { label: 'Fiction' },
  { label: 'History' },
  { label: 'Science' },
  { label: 'Kids' },
]

const books = [
  { Cover: BookCover, title: 'The Deep Blue', author: 'Mara Lind', status: 'Available', statusClass: 'bg-green-600' },
  { Cover: BookCover2, title: 'Salt and Tide', author: 'J. Okafor', status: 'On loan', statusClass: 'bg-red-600' },
  { Cover: BookCover3, title: 'Night Swimmers', author: 'Ella Brandt', status: 'Available', statusClass: 'bg-green-600' },
  { Cover: BookCover4, title: 'Coral Atlas', author: 'Dr. R. Shah', status: 'Available', statusClass: 'bg-green-600' },
]

export default function App() {
  return (
    <main className="h-[900px] w-[1280px] box-border bg-white overflow-hidden">
      <header className="h-[70px] px-10 flex items-center justify-between border-b border-[#e5e7eb]">
        <span className="text-lg font-bold text-slate-900">City Library</span>
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-900">
          <a href="#">My loans</a>
          <a href="#">Sign out</a>
        </nav>
      </header>

      <div className="px-10 mt-[29px] h-[58px] flex items-center gap-5">
        <input
          type="text"
          placeholder="Search books, authors, topics"
          className="flex-1 h-[58px] rounded-full border border-[#ccd5e1] bg-white px-6 text-sm text-slate-500 placeholder:text-slate-400 focus:outline-none"
        />
        <button className="h-[58px] w-[140px] shrink-0 rounded-full bg-[#2563eb] text-sm font-bold text-white">
          Search
        </button>
      </div>

      <div className="px-10 mt-[28px] flex items-center gap-3">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={
              chip.active
                ? 'flex h-[38px] items-center rounded-full bg-[#1e293b] px-5 text-sm font-bold text-white'
                : 'flex h-[38px] items-center rounded-full bg-[#f1f4f8] px-5 text-sm text-slate-700'
            }
          >
            {chip.label}
          </span>
        ))}
      </div>

      <p className="px-10 mt-4 text-sm text-slate-500">128 results for "ocean"</p>

      <div className="px-10 mt-[30px] grid grid-cols-4 gap-7">
        {books.map((book) => (
          <div key={book.title} className="flex flex-col">
            <div className="w-full" style={{ aspectRatio: '271 / 381' }}>
              <book.Cover className="h-full w-full" />
            </div>
            <h3 className="mt-3 font-bold text-slate-900">{book.title}</h3>
            <p className="text-sm text-slate-500">{book.author}</p>
            <span className={`mt-2 w-fit rounded-full px-3 py-1 text-xs font-semibold text-white ${book.statusClass}`}>
              {book.status}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
