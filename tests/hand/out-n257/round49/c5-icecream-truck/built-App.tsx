import IceCream from './components/IceCream'

export default function App() {
  return (
    <main
      className="relative mx-auto overflow-hidden flow-root bg-[#c6f0e6]"
      style={{ width: 1280, height: 900 }}
    >
      {/* decorative sun */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ left: 1041, top: 90, width: 149, height: 149, backgroundColor: '#ffd23f' }}
      />

      {/* header */}
      <div
        className="absolute font-extrabold"
        style={{ left: 64, top: 28, fontSize: 32, lineHeight: 1, color: '#e63946' }}
      >
        Mister Swirl
      </div>
      <nav
        className="absolute flex items-center gap-8 font-medium"
        style={{ left: 1000, top: 36, fontSize: 18, color: '#222240' }}
      >
        <span>Route</span>
        <span>Flavours</span>
        <span>Parties</span>
      </nav>

      {/* hero */}
      <h1
        className="absolute font-bold whitespace-nowrap"
        style={{ left: 64, top: 97, fontSize: 92, lineHeight: 1, color: '#222240' }}
      >
        Follow the jingle
      </h1>
      <button
        className="absolute rounded-xl font-bold text-white flex items-center justify-center"
        style={{ left: 64, top: 230, width: 230, height: 55, backgroundColor: '#e63946', fontSize: 18 }}
      >
        Where is it now?
      </button>

      {/* ice cream cone */}
      <div
        className="absolute"
        style={{
          left: 130,
          top: 470,
          width: 60,
          height: 91,
          clipPath: 'polygon(0px 0px, 60px 0px, 30px 91px)',
          backgroundColor: '#d4a373',
        }}
      />
      <div
        className="absolute rounded-full border-[4px] border-[#fff0f3] bg-transparent box-border"
        style={{ left: 126, top: 415, width: 70, height: 70 }}
      />

      {/* ice cream truck */}
      <div
        className="absolute"
        style={{
          left: 230,
          top: 330,
          width: 830,
          height: 350,
          clipPath:
            'polygon(0px 0px, 620px 0px, 620px 120px, 830px 120px, 830px 350px, 0px 350px)',
          backgroundColor: '#ff9eb0',
        }}
      />
      <div className="absolute" style={{ left: 279, top: 359, width: 401, height: 58, backgroundColor: '#e63946' }} />
      <div className="absolute" style={{ left: 299, top: 415, width: 361, height: 135, backgroundColor: '#3d405b' }} />
      <div className="absolute" style={{ left: 880, top: 479, width: 141, height: 91, backgroundColor: '#bde0fb' }} />
      <div className="absolute rounded-full" style={{ left: 329, top: 640, width: 101, height: 100, backgroundColor: '#222240' }}>
        <div className="absolute rounded-full bg-white" style={{ left: 20.5, top: 20, width: 60, height: 60 }} />
        <div className="absolute rounded-full" style={{ left: 40.5, top: 40, width: 20, height: 20, backgroundColor: '#222240' }} />
      </div>
      <div className="absolute rounded-full" style={{ left: 850, top: 640, width: 101, height: 100, backgroundColor: '#222240' }}>
        <div className="absolute rounded-full bg-white" style={{ left: 20.5, top: 20, width: 60, height: 60 }} />
        <div className="absolute rounded-full" style={{ left: 40.5, top: 40, width: 20, height: 20, backgroundColor: '#222240' }} />
      </div>
      <IceCream className="absolute text-[#222240]" style={{ left: 229, top: 329 }} />
      <div
        className="absolute font-bold text-white"
        style={{ left: 300, top: 610, fontSize: 28 }}
      >
        Soft serve $4
      </div>

      {/* road footer */}
      <div
        className="absolute"
        style={{ left: 1, top: 739, width: 1277, height: 159, backgroundColor: '#4a4e69' }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{ left: 39 + i * 200, top: 73, width: 120, height: 6, backgroundColor: '#ffffff' }}
          />
        ))}
      </div>
    </main>
  )
}
