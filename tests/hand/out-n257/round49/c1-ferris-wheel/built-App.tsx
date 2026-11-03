import FerrisWheel from './components/FerrisWheel'

export default function App() {
  return (
    <main
      className="relative w-full overflow-hidden bg-[#2d2d60]"
      style={{ height: 900 }}
    >
      <header className="absolute inset-x-16 top-12 flex items-start justify-between">
        <h1 className="text-3xl font-bold text-[#ffd166]">Pier Nine</h1>
        <nav className="flex gap-10 text-white font-medium">
          <a href="#">Rides</a>
          <a href="#">Tickets</a>
          <a href="#">Hours</a>
        </nav>
      </header>

      <h2
        className="absolute left-16 font-bold text-white text-[58px] leading-[1.15]"
        style={{ top: 234 }}
      >
        Round and
        <br />
        round till late
      </h2>

      <p className="absolute left-16 max-w-md text-white/70 text-lg" style={{ top: 480 }}>
        Open every night on the old pier, from May to the first frost.
      </p>

      <a
        href="#"
        className="absolute left-16 flex items-center justify-center rounded-full bg-[#f24a72] font-bold text-white"
        style={{ top: 570, width: 220, height: 57 }}
      >
        Get wristbands
      </a>

      <FerrisWheel className="absolute" style={{ left: 576, top: 111 }} />

      <div className="absolute rounded-full border-[10px] border-[#ffd166]" style={{ left: 576, top: 135, width: 568, height: 570 }} />
      <div className="absolute bg-[#ffd166]" style={{ left: 858, top: 135, width: 4, height: 570 }} />
      {[-45, 0, 45, 135, 180, -135].map((deg) => (
        <div
          key={deg}
          className="absolute bg-[#ffd166]"
          style={{ left: 860, top: 418, width: 284, height: 4, transformOrigin: 'left center', transform: `rotate(${deg}deg)` }}
        />
      ))}
      <div className="absolute rounded-full bg-[#f24a72]" style={{ left: 825, top: 386, width: 69, height: 68 }} />
      <div className="absolute bg-[#1589b3]" style={{ left: 828, top: 111, width: 65, height: 49 }} />
      <div className="absolute bg-[#ffd166]" style={{ left: 1032, top: 197, width: 65, height: 49 }} />
      <div className="absolute bg-[#f24a72]" style={{ left: 1117, top: 401, width: 66, height: 50 }} />
      <div className="absolute bg-[#0ad9a0]" style={{ left: 1033, top: 607, width: 65, height: 49 }} />

      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between px-16 bg-[#122340] text-white"
        style={{ height: 139 }}
      >
        <span>Rides till 11</span>
        <span>Kids under 5 free</span>
        <span>Cash and card</span>
      </div>
    </main>
  )
}
