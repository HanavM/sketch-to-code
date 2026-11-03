import Rocket from './components/Rocket'

const navLinks = [
  { label: 'Missions', x: 1016 },
  { label: 'Crew', x: 1108 },
  { label: 'Apply', x: 1176 },
]

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
    <main className="relative h-screen w-full overflow-hidden" style={{ background: '#0b1f47' }}>
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: s.x, top: s.y, width: 6, height: 6 }}
        />
      ))}

      <div className="absolute text-2xl font-bold text-white" style={{ left: 64, top: 26 }}>
        Liftoff Camp
      </div>

      {navLinks.map((l) => (
        <a key={l.label} href="#" className="absolute text-white" style={{ left: l.x, top: 28 }}>
          {l.label}
        </a>
      ))}

      <h1
        className="absolute font-bold leading-[1.1] text-white"
        style={{ left: 64, top: 185, fontSize: 64 }}
      >
        Build a rocket
        <br />
        this summer
      </h1>

      <p className="absolute text-white/80" style={{ left: 64, top: 376 }}>
        Two weeks of science, engines and one big launch day.
      </p>

      <a
        href="#"
        className="absolute flex items-center justify-center rounded-full font-bold text-white"
        style={{ left: 65, top: 469, width: 229, height: 61, background: '#ff7a1a' }}
      >
        Join the crew
      </a>

      <div className="absolute" style={{ left: 859, top: 230, width: 122, height: 381, background: '#f0f3f8' }} />

      <div className="absolute" style={{ left: 880, top: 610, width: 81, height: 150, background: '#ffae1f' }} />

      <Rocket className="absolute" style={{ left: 859, top: 110 }} />

      <div
        className="absolute"
        style={{
          left: 860,
          top: 110,
          width: 121,
          height: 130,
          background: '#f24545',
          clipPath: 'polygon(60px 0px, 121px 130px, 0px 130px)',
        }}
      />

      <div
        className="absolute rounded-full"
        style={{ left: 891, top: 300, width: 58, height: 60, background: '#38bdf8' }}
      />

      <div className="absolute" style={{ left: 1, top: 799, width: 1277, height: 99, background: '#13285e' }} />
    </main>
  )
}
