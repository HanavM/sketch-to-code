import TrainCar from './components/TrainCar'

export default function App() {
  return (
    <main
      className="relative w-full h-[900px] overflow-hidden"
      style={{ background: '#bfe2f4' }}
    >
      {/* header */}
      <div
        className="absolute font-bold"
        style={{ left: 70, top: 48, fontSize: 28, color: '#16324f' }}
      >
        Gornerbahn
      </div>
      <nav
        className="absolute flex gap-10"
        style={{ left: 860, top: 48, fontSize: 17, color: '#16324f' }}
      >
        <span>Timetable</span>
        <span>Fares</span>
        <span>Stations</span>
      </nav>

      {/* hero headline */}
      <div className="absolute" style={{ left: 70, top: 87, width: 615 }}>
        <div style={{ fontSize: 73, lineHeight: '80px', fontWeight: 800, color: '#16324f', whiteSpace: 'nowrap' }}>
          Up the mountain
        </div>
        <div style={{ fontSize: 73, lineHeight: '80px', fontWeight: 800, color: '#16324f', whiteSpace: 'nowrap' }}>
          by rail
        </div>
      </div>

      {/* CTA button */}
      <button
        className="absolute rounded-lg flex items-center justify-center text-white font-bold"
        style={{ left: 70, top: 289, width: 211, height: 56, background: '#c8102e', fontSize: 18 }}
      >
        Buy a ticket
      </button>

      {/* large mountain */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 560,
          top: 150,
          width: 718,
          height: 550,
          clipPath: 'polygon(360px 0px, 718px 550px, 0px 550px)',
          background: '#6f7f8f',
        }}
      />
      {/* snow cap */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 800,
          top: 150,
          width: 239,
          height: 183,
          clipPath: 'polygon(120px 0px, 239px 183px, 0px 183px)',
          background: '#ffffff',
        }}
      />

      {/* smaller mountain */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 150,
          top: 370,
          width: 599,
          height: 330,
          clipPath: 'polygon(300px 0px, 599px 330px, 0px 330px)',
          background: '#8a99a6',
        }}
      />

      {/* rail */}
      <div
        className="absolute pointer-events-none"
        style={{ left: 2, top: 674, width: 1276, height: 6, background: '#222222' }}
      />

      {/* train cars */}
      <div className="absolute" style={{ left: 199, top: 539, width: 732, height: 112 }}>
        <div className="absolute" style={{ left: 0, top: 0, width: 231, height: 111, background: '#c8102e' }} />
        <div className="absolute" style={{ left: 251, top: 0, width: 231, height: 111, background: '#c8102e' }} />
        <div className="absolute" style={{ left: 500, top: 0, width: 231, height: 112, background: '#f2b035' }} />
        <TrainCar className="absolute left-0 top-0" />
      </div>

      {/* footer */}
      <div
        className="absolute"
        style={{ left: 1, top: 699, width: 1277, height: 199, background: '#4f8a4b', borderRadius: 0 }}
      >
        <span className="absolute font-bold text-white" style={{ left: 69, top: 81, fontSize: 20 }}>
          First train 7:10
        </span>
        <span className="absolute font-bold text-white" style={{ left: 559, top: 81, fontSize: 20 }}>
          Summit 3,089 m
        </span>
        <span className="absolute font-bold text-white" style={{ left: 1039, top: 81, fontSize: 20 }}>
          Dogs ride free
        </span>
      </div>
    </main>
  )
}
