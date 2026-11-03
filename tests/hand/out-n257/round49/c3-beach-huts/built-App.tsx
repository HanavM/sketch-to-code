import BeachHut from './components/BeachHut'

export default function App() {
  return (
    <main className="relative overflow-hidden bg-[#fdf5e0]" style={{ width: 1280, height: 900 }}>
      {/* sky band */}
      <div
        className="pointer-events-none absolute bg-[#3fa7d6]"
        style={{ left: 1, top: 329, width: 1277, height: 172 }}
      />

      {/* sand panel */}
      <div
        className="absolute"
        style={{
          left: 1,
          top: 499,
          width: 1277,
          height: 399,
          background: '#f5e1b0',
        }}
      >
        <span className="absolute font-bold text-[#1d3c4e]" style={{ left: 70, top: 301, fontSize: 26 }}>
          Sleeps four
        </span>
        <span className="absolute font-bold text-[#1d3c4e]" style={{ left: 500, top: 301, fontSize: 26 }}>
          Kettle and deckchairs
        </span>
        <span className="absolute font-bold text-[#1d3c4e]" style={{ left: 1000, top: 301, fontSize: 26 }}>
          From $180 a week
        </span>
      </div>

      {/* beach hut row */}
      <div className="absolute" style={{ left: 60, top: 369, width: 1144, height: 352 }}>
        <BeachHut />
      </div>

      {/* header */}
      <span className="absolute font-extrabold text-[#1d3c4e]" style={{ left: 64, top: 24, fontSize: 28 }}>
        Hut Row
      </span>
      <nav className="absolute flex gap-10 text-[#1d3c4e]" style={{ left: 1020, top: 30, fontSize: 17 }}>
        <a href="#huts">Huts</a>
        <a href="#prices">Prices</a>
        <a href="#book">Book</a>
      </nav>

      {/* headline */}
      <h1
        className="absolute font-extrabold text-[#1d3c4e]"
        style={{ left: 64, top: 106, width: 691, fontSize: 51, lineHeight: '66px' }}
      >
        A hut by the sea, by the week
      </h1>

      {/* promo badge */}
      <div
        className="absolute flex items-center justify-center rounded-full bg-[#1d3c4e] font-bold text-white"
        style={{ left: 960, top: 150, width: 220, height: 57, fontSize: 18 }}
      >
        See free weeks
      </div>
    </main>
  )
}
