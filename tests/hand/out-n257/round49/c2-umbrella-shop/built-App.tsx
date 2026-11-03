import Umbrella from './components/Umbrella'

const SERIF = 'Georgia, Cambria, "Times New Roman", Times, serif'
const NAVY = '#22303c'

export default function App() {
  return (
    <main
      className="relative w-full h-[900px] overflow-hidden"
      style={{ backgroundColor: '#e4edf2', boxSizing: 'border-box' }}
    >
      <div
        className="absolute font-bold"
        style={{ left: 64, top: 45, fontFamily: SERIF, fontSize: 26, color: NAVY }}
      >
        Brolly &amp; Sons
      </div>

      <nav
        className="absolute flex gap-10 font-medium"
        style={{ left: 960, top: 52, fontSize: 16, color: NAVY }}
      >
        <span>Umbrellas</span>
        <span>Repairs</span>
        <span>Visit</span>
      </nav>

      <h1
        className="absolute whitespace-nowrap italic"
        style={{
          left: 64,
          top: 155,
          height: 79,
          fontFamily: SERIF,
          fontSize: 97,
          lineHeight: '79px',
          fontWeight: 400,
          color: NAVY,
        }}
      >
        Let it pour
      </h1>

      <p
        className="absolute"
        style={{ left: 64, top: 255, width: 480, fontFamily: SERIF, fontSize: 18, lineHeight: 1.5, color: '#3b4a5a' }}
      >
        Hand-made umbrellas that last a lifetime of bad weather.
      </p>

      <button
        className="absolute flex items-center justify-center rounded-lg font-bold text-white"
        style={{ left: 879, top: 189, width: 221, height: 58, backgroundColor: NAVY }}
      >
        Shop the rack
      </button>

      <div
        className="absolute"
        style={{
          left: 100,
          top: 430,
          width: 300,
          height: 150,
          background: '#d34a5e',
          borderRadius: '50% 50% 0 0',
          zIndex: 1,
        }}
      />
      <div
        className="absolute"
        style={{
          left: 490,
          top: 431,
          width: 300,
          height: 149,
          background: '#eead4a',
          borderRadius: '50% 50% 0 0',
          zIndex: 2,
        }}
      />
      <div
        className="absolute"
        style={{
          left: 880,
          top: 430,
          width: 299,
          height: 150,
          background: '#00788c',
          borderRadius: '50% 50% 0 0',
          zIndex: 3,
        }}
      />

      <Umbrella className="absolute" style={{ left: 2, top: 430, zIndex: 0 }} />

      <svg aria-hidden className="absolute pointer-events-none" width={24} height={176} viewBox="0 0 24 176" style={{ left: 228, top: 580, zIndex: 1 }}>
        <path d="M12,0 V128 C12,145 3,150 3,160 C3,170 12,172 18,164" fill="none" stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg aria-hidden className="absolute pointer-events-none" width={24} height={176} viewBox="0 0 24 176" style={{ left: 619, top: 580, zIndex: 1 }}>
</svg>
      <svg aria-hidden className="absolute pointer-events-none" width={24} height={175} viewBox="0 0 24 175" style={{ left: 1009, top: 580, zIndex: 1 }}>
        <path d="M12,0 V127 C12,144 3,149 3,159 C3,169 12,171 18,163" fill="none" stroke="#3a3a3a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="absolute" style={{ left: 2, top: 799, width: 1276, height: 99, background: '#3b4a5a', zIndex: 0 }} />

      <div
        className="absolute font-bold"
        style={{ left: 268, top: 610, fontFamily: SERIF, fontSize: 20, color: NAVY, zIndex: 4 }}
      >
        $48
      </div>
      <div
        className="absolute font-bold"
        style={{ left: 658, top: 610, fontFamily: SERIF, fontSize: 20, color: NAVY, zIndex: 4 }}
      >
        $62
      </div>
      <div
        className="absolute font-bold"
        style={{ left: 1048, top: 610, fontFamily: SERIF, fontSize: 20, color: NAVY, zIndex: 4 }}
      >
        $75
      </div>
    </main>
  )
}
