import RocketShip from './components/RocketShip'

const stars = [
  { x: 48, y: 96, s: 3 },
  { x: 150, y: 150, s: 4 },
  { x: 280, y: 64, s: 3 },
  { x: 410, y: 130, s: 3 },
  { x: 96, y: 320, s: 3 },
  { x: 330, y: 420, s: 4 },
  { x: 200, y: 540, s: 3 },
  { x: 60, y: 660, s: 3 },
  { x: 420, y: 610, s: 4 },
  { x: 150, y: 740, s: 3 },
  { x: 470, y: 300, s: 3 },
]

export default function App() {
  return (
    <main
      className="relative h-screen w-full overflow-hidden flow-root"
      style={{ backgroundColor: '#0b1f47' }}
    >
      {stars.map((star, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white pointer-events-none"
          style={{ left: star.x, top: star.y, width: star.s, height: star.s }}
        />
      ))}

      <nav className="absolute top-0 left-0 flex w-full items-center justify-between px-16 py-6">
        <span className="text-2xl font-bold text-white">Liftoff Camp</span>
        <div className="flex items-center gap-10 text-base font-medium text-white">
          <a href="#">Missions</a>
          <a href="#">Crew</a>
          <a href="#">Apply</a>
        </div>
      </nav>

      <h1
        className="absolute left-16 text-7xl font-extrabold leading-[1.1] text-white"
        style={{ top: 180 }}
      >
        Build a rocket
        <br />
        this summer
      </h1>

      <p className="absolute left-16 max-w-md text-lg text-white/80" style={{ top: 372 }}>
        Two weeks of science, engines and one big launch day.
      </p>

      <button
        className="absolute rounded-full font-bold text-white"
        style={{ left: 65, top: 469, width: 230, height: 61, backgroundColor: '#ff7a1a' }}
      >
        Join the crew
      </button>

      <div className="absolute" style={{ left: 859, top: 110, width: 122, height: 650 }}>
        <div
          className="absolute"
          style={{
            left: 1,
            top: 0,
            width: 121,
            height: 130,
            backgroundColor: '#f24545',
            clipPath: 'polygon(60px 0px, 121px 130px, 0px 130px)',
            zIndex: 2,
          }}
        />
        <div
          className="absolute"
          style={{
            left: 0,
            top: 120,
            width: 122,
            height: 381,
            backgroundColor: '#f0f3f8',
            zIndex: 1,
          }}
        />
        <RocketShip className="absolute left-0 top-0" />
        <div
          className="absolute rounded-full"
          style={{
            left: 32,
            top: 190,
            width: 58,
            height: 60,
            backgroundColor: '#38bdf8',
            zIndex: 3,
          }}
        />
      </div>

      <div
        className="absolute bottom-0 left-0 w-full"
        style={{ height: 99, backgroundColor: '#13285e' }}
      />
    </main>
  )
}
