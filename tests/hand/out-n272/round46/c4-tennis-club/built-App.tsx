export default function App() {
  return (
    <div className="relative w-[1280px] h-[900px] bg-white overflow-hidden">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 h-[165px]">
        <div
          className="absolute text-xl font-bold text-[#14213d]"
          style={{ left: 70, top: 28 }}
        >
          Baseline Tennis
        </div>
        <nav
          className="absolute flex items-center gap-10 text-[#14213d] text-base"
          style={{ left: 990, top: 30 }}
        >
          <a href="#" className="hover:opacity-70">Courts</a>
          <a href="#" className="hover:opacity-70">Coaching</a>
          <a href="#" className="hover:opacity-70">Join</a>
        </nav>
        <h1
          className="absolute whitespace-nowrap font-bold text-[#14213d]"
          style={{ left: 72, top: 132, fontSize: 66, lineHeight: '64px' }}
        >
          Six courts. Open till ten.
        </h1>
      </header>

      {/* Hero */}
      <section
        className="absolute"
        style={{ left: 69, top: 269, width: 761, height: 442, backgroundColor: '#2e8b57', borderRadius: 0 }}
      >
        <div
          className="absolute border-[2px]"
          style={{ left: 130, top: 120, width: 502, height: 202, backgroundColor: 'transparent', borderColor: '#ffffff', borderStyle: 'solid', boxSizing: 'border-box' }}
        />
        <div
          className="absolute"
          style={{ left: 382, top: 9, width: 2, height: 424, backgroundColor: '#ffffff', color: '#ffffff' }}
        />
        <div
          className="absolute rounded-full"
          style={{ left: 551, top: 61, width: 70, height: 70, backgroundColor: '#d4f83c' }}
        />
      </section>

      {/* Stat cards */}
      <div
        className="absolute bg-[#f0f3f8] border border-slate-200 rounded-lg shadow-sm flex flex-col justify-center px-6"
        style={{ left: 879, top: 269, width: 331, height: 131 }}
      >
        <div className="text-[47px] font-bold leading-none text-[#14213d] whitespace-nowrap">6</div>
        <div className="text-sm text-gray-500 mt-2">clay and hard courts</div>
      </div>
      <div
        className="absolute bg-[#f0f3f8] border border-slate-200 rounded-lg shadow-sm flex flex-col justify-center px-6"
        style={{ left: 879, top: 424, width: 331, height: 131 }}
      >
        <div className="text-[47px] font-bold leading-none text-[#14213d] whitespace-nowrap">14</div>
        <div className="text-sm text-gray-500 mt-2">coaches on staff</div>
      </div>
      <div
        className="absolute bg-[#f0f3f8] border border-slate-200 rounded-lg shadow-sm flex flex-col justify-center px-6"
        style={{ left: 880, top: 579, width: 331, height: 131 }}
      >
        <div className="text-[47px] font-bold leading-none text-[#14213d] whitespace-nowrap">$39</div>
        <div className="text-sm text-gray-500 mt-2">a month, all courts</div>
      </div>

      {/* CTA */}
      <button
        className="absolute flex flex-col items-start justify-center px-6 bg-[#14213d]"
        style={{ left: 69, top: 759, width: 241, height: 61 }}
      >
        <span className="text-white font-bold text-base">Become a member</span>
      </button>
      <span
        className="absolute text-gray-500 text-sm"
        style={{ left: 340, top: 781 }}
      >
        First week free
      </span>
    </div>
  )
}
