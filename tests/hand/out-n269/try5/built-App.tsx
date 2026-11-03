import Rocket from './components/Rocket'

export default function App() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#0b1f47]">
      {/* stars */}
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute rounded-full bg-white" style={{ left: 701, top: 141, width: 6, height: 6 }} />
        <span className="absolute rounded-full bg-white" style={{ left: 761, top: 421, width: 6, height: 6 }} />
        <span className="absolute rounded-full bg-white" style={{ left: 691, top: 641, width: 6, height: 6 }} />
        <span className="absolute rounded-full bg-white" style={{ left: 1061, top: 121, width: 6, height: 6 }} />
        <span className="absolute rounded-full bg-white" style={{ left: 1121, top: 181, width: 6, height: 6 }} />
        <span className="absolute rounded-full bg-white" style={{ left: 1151, top: 471, width: 6, height: 6 }} />
      </div>

      {/* header */}
      <div className="absolute left-16 top-[22px] text-2xl font-bold text-white">Liftoff Camp</div>
      <nav className="absolute right-16 top-[24px] flex gap-8 text-base font-medium text-white">
        <a href="#missions">Missions</a>
        <a href="#crew">Crew</a>
        <a href="#apply">Apply</a>
      </nav>

      {/* hero headline */}
      <h1 className="absolute left-16 text-7xl font-bold leading-none text-white" style={{ top: 184 }}>
        <span className="block">Build a rocket</span>
        <span className="block">this summer</span>
      </h1>

      {/* hero body copy */}
      <p className="absolute left-16 max-w-md text-lg text-white" style={{ top: 362 }}>
        Two weeks of science, engines and one big launch day.
      </p>

      {/* CTA pill button */}
      <button
        type="button"
        className="absolute rounded-full font-bold text-white"
        style={{ left: 65, top: 469, width: 229, height: 61, background: '#ff7a1a' }}
      >
        Join the crew
      </button>

      {/* rocket icon */}
      <Rocket className="absolute" style={{ left: 859, top: 110 }} />

      {/* bottom bar */}
      <div className="absolute bottom-0 left-0 w-full" style={{ height: 99, background: '#13285e' }} />
    </main>
  )
}
