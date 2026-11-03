export default function App() {
  return (
    <main className="h-screen w-full bg-white overflow-hidden">
      <header className="h-[70px] flex items-center justify-between px-10" style={{ borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#e5e7eb" }}>
        <span className="font-bold text-lg text-gray-900">City Library</span>
        <nav className="flex items-center gap-6 text-sm text-gray-700">
          <a href="#" className="hover:text-gray-900">My loans</a>
          <a href="#" className="hover:text-gray-900">Sign out</a>
        </nav>
      </header>

      <div className="px-10">
        <div className="mt-[29px] flex items-center gap-5">
          <div className="w-[899px] h-[58px] rounded-full border border-[#ccd5e1] bg-white flex items-center px-6">
            <span className="text-gray-400">Search books, authors, topics</span>
          </div>
          <button className="w-[140px] h-[57px] rounded-full bg-[#2563eb] text-white font-bold">
            Search
          </button>
        </div>

        <div className="mt-[28px] flex items-center gap-3">
          <span className="h-[37px] px-5 rounded-full bg-[#1e293b] text-white font-bold text-sm flex items-center justify-center">
            All
          </span>
          <span className="h-[38px] px-5 rounded-full bg-[#f1f4f8] text-gray-700 text-sm flex items-center justify-center">
            Fiction
          </span>
          <span className="h-[37px] px-5 rounded-full bg-[#f1f4f8] text-gray-700 text-sm flex items-center justify-center">
            History
          </span>
          <span className="h-[38px] px-5 rounded-full bg-[#f1f4f8] text-gray-700 text-sm flex items-center justify-center">
            Science
          </span>
          <span className="h-[37px] px-5 rounded-full bg-[#f1f4f8] text-gray-700 text-sm flex items-center justify-center">
            Kids
          </span>
        </div>

        <p className="mt-2 text-sm text-gray-500">128 results for "ocean"</p>

        <div className="mt-[38px] grid grid-cols-4 gap-7">
          <div className="h-[381px] w-full flex flex-col">
            <div className="h-[277px] w-full" style={{ background: "#0f7490" }} />
            <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
              <h3 className="font-bold text-lg text-gray-900">The Deep Blue</h3>
              <p className="text-sm text-gray-700">Mara Lind</p>
              <span className="w-fit px-3 py-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                Available
              </span>
            </div>
          </div>

          <div className="h-[382px] w-full flex flex-col">
            <div className="h-[277px] w-full" style={{ background: "#f59e0b" }} />
            <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
              <h3 className="font-bold text-lg text-gray-900">Salt and Tide</h3>
              <p className="text-sm text-gray-700">J. Okafor</p>
              <span className="w-fit px-3 py-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                On loan
              </span>
            </div>
          </div>

          <div className="h-[382px] w-full flex flex-col">
            <div className="h-[277px] w-full" style={{ background: "#7c3aed" }} />
            <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
              <h3 className="font-bold text-lg text-gray-900">Night Swimmers</h3>
              <p className="text-sm text-gray-700">Ella Brandt</p>
              <span className="w-fit px-3 py-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                Available
              </span>
            </div>
          </div>

          <div className="h-[382px] w-full flex flex-col">
            <div className="h-[277px] w-full" style={{ background: "#334155" }} />
            <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
              <h3 className="font-bold text-lg text-gray-900">Coral Atlas</h3>
              <p className="text-sm text-gray-700">Dr. R. Shah</p>
              <span className="w-fit px-3 py-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                Available
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
