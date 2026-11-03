import Rocket from './components/Rocket'

const STARS = [
  { x: 704, y: 144 },
  { x: 764, y: 424 },
  { x: 694, y: 644 },
  { x: 1064, y: 124 },
  { x: 1124, y: 184 },
  { x: 1154, y: 474 },
]

export default function App() {
  return (
    <main className="relative w-full min-h-screen bg-[#0b1f47] overflow-hidden">
      {STARS.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white pointer-events-none"
          style={{ left: s.x - 3, top: s.y - 3, width: 6, height: 6 }}
        />
      ))}

      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-16 py-6">
        <span className="text-white font-bold text-xl">Liftoff Camp</span>
        <nav className="flex gap-10 text-white">
          <a href="#">Missions</a>
          <a href="#">Crew</a>
          <a href="#">Apply</a>
        </nav>
      </header>

      <div
        className="absolute text-white font-bold"
        style={{ left: 64, top: 182, fontSize: 72, lineHeight: 1.05 }}
      >
        <div>Build a rocket</div>
        <div>this summer</div>
      </div>

      <p className="absolute text-white/70 text-lg max-w-md" style={{ left: 64, top: 376 }}>
        Two weeks of science, engines and one big launch day.
      </p>

      <button
        className="absolute rounded-full bg-[#ff7a1a] text-white font-bold flex items-center justify-center"
        style={{ left: 65, top: 469, width: 229, height: 61 }}
      >
        Join the crew
      </button>

      <div className="absolute" style={{ left: 859, top: 110 }}>
        <Rocket />
      </div>

      <div className="absolute left-0 right-0 bg-[#13285e]" style={{ top: 799, height: 99 }} />
    </main>
  )
}
