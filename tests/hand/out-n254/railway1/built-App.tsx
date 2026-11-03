import TwoMountains from './components/TwoMountains'

export default function App() {
  return (
    <main
      className="relative overflow-hidden"
      style={{ width: 1280, height: 900, background: '#bfe2f4' }}
    >
      {/* header: logo + nav */}
      <div
        className="absolute font-bold"
        style={{ left: 70, top: 26, fontSize: 24, color: '#16324f', zIndex: 10 }}
      >
        Gornerbahn
      </div>
      <nav
        className="absolute flex items-center gap-10 font-medium"
        style={{ left: 860, top: 31, fontSize: 17, color: '#16324f', zIndex: 10 }}
      >
        <span>Timetable</span>
        <span>Fares</span>
        <span>Stations</span>
      </nav>

      {/* hero headline */}
      <div
        className="absolute font-extrabold"
        style={{ left: 70, top: 87, width: 615, zIndex: 10, color: '#16324f' }}
      >
        <div style={{ fontSize: 73, lineHeight: '80px', whiteSpace: 'nowrap' }}>Up the mountain</div>
        <div style={{ fontSize: 73, lineHeight: '80px', whiteSpace: 'nowrap' }}>by rail</div>
      </div>

      {/* CTA button */}
      <button
        className="absolute rounded-lg font-bold text-white"
        style={{ left: 70, top: 289, width: 211, height: 56, background: '#c8102e', fontSize: 18, zIndex: 10 }}
      >
        Buy a ticket
      </button>

      {/* mountain illustration */}
      <div
        className="absolute"
        style={{
          left: 560,
          top: 150,
          width: 718,
          height: 550,
          background: '#6f7f8f',
          clipPath: 'polygon(360px 0px, 718px 550px, 0px 550px)',
          zIndex: 1,
        }}
      />
      <div
        className="absolute"
        style={{
          left: 800,
          top: 150,
          width: 239,
          height: 183,
          background: '#ffffff',
          clipPath: 'polygon(120px 0px, 239px 183px, 0px 183px)',
          zIndex: 2,
        }}
      />
      <div
        className="absolute"
        style={{
          left: 150,
          top: 370,
          width: 599,
          height: 330,
          background: '#8a99a6',
          clipPath: 'polygon(300px 0px, 599px 330px, 0px 330px)',
          zIndex: 3,
        }}
      />

      {/* train car bodies + rail, painted as flat blocks */}
      <div className="absolute" style={{ left: 199, top: 539, width: 231, height: 111, background: '#c8102e', zIndex: 4 }} />
      <div className="absolute" style={{ left: 450, top: 539, width: 231, height: 111, background: '#c8102e', zIndex: 4 }} />
      <div className="absolute" style={{ left: 699, top: 539, width: 231, height: 112, background: '#f2b035', zIndex: 4 }} />
      <div className="absolute" style={{ left: 2, top: 673, width: 1276, height: 2, background: '#222222', zIndex: 4 }} />

      {/* train on rail */}
      <div className="absolute" style={{ left: 2, top: 150, zIndex: 5 }}>
        <TwoMountains />
      </div>

      {/* footer band */}
      <div className="absolute" style={{ left: 1, top: 699, width: 1277, height: 199, background: '#4f8a4b', zIndex: 10 }}>
        <div className="absolute font-bold text-white" style={{ left: 69, top: 71, fontSize: 20 }}>
          First train 7:10
        </div>
        <div className="absolute text-white" style={{ left: 559, top: 71, fontSize: 20 }}>
          Summit 3,089 m
        </div>
        <div className="absolute text-white" style={{ left: 1039, top: 71, fontSize: 20 }}>
          Dogs ride free
        </div>
      </div>
    </main>
  )
}
