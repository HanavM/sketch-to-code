import Rocket from './components/Rocket'

const stars = [
  { x: 704, y: 144 },
  { x: 764, y: 424 },
  { x: 694, y: 644 },
  { x: 1064, y: 124 },
  { x: 1124, y: 184 },
  { x: 1154, y: 474 },
]

export default function App() {
  return (
    <main className="relative w-full h-[900px] overflow-hidden bg-[#0b1f47]">
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: s.x - 3, top: s.y - 3, width: 6, height: 6 }}
        />
      ))}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-16 py-6">
        <span className="text-white font-bold text-2xl">Liftoff Camp</span>
        <nav className="flex items-center gap-10 text-white font-semibold">
          <a href="#missions">Missions</a>
          <a href="#crew">Crew</a>
          <a href="#apply">Apply</a>
        </nav>
      </div>

      <h1 className="absolute left-16 text-white font-bold leading-[1.05] text-[72px]" style={{ top: 160, width: 700 }}>
        Build a rocket
        <br />
        this summer
      </h1>

      <p className="absolute left-16 text-slate-300 text-xl" style={{ top: 350, width: 600 }}>
        Two weeks of science, engines and one big launch day.
      </p>

      <button
        className="absolute rounded-full bg-[#ff7a1a] text-white font-bold"
        style={{ left: 65, top: 469, width: 229, height: 61 }}
      >
        Join the crew
      </button>

      <div className="absolute" style={{ left: 859, top: 110, width: 121.6, height: 649.5 }}>
        <Rocket className="absolute inset-0" />
        <div
          className="absolute"
          style={{
            left: 1,
            top: 0,
            width: 121,
            height: 130,
            clipPath: 'polygon(60px 0px, 121px 130px, 0px 130px)',
            background: '#f24545',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{ left: 32, top: 190, width: 58, height: 60, background: '#38bdf8' }}
        />
      </div>

      <div
        className="absolute left-0 right-0 bottom-0"
        style={{ height: 99, background: '#13285e' }}
      />
    </main>
  )
}
