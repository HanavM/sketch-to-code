import CassetteTape from './components/CassetteTape'

export default function App() {
  return (
    <main
      className="relative w-full overflow-hidden"
      style={{ height: 900, background: '#fbe9d2' }}
    >
      <span
        className="absolute font-bold text-[#1c1c30]"
        style={{ left: 64, top: 45, fontSize: 18, letterSpacing: '0.2em' }}
      >
        SIDE B
      </span>

      <nav
        className="absolute flex gap-8 font-medium text-[#1c1c30]"
        style={{ left: 1020, top: 45, fontSize: 16 }}
      >
        <span>Tapes</span>
        <span>Players</span>
        <span>Swap</span>
      </nav>

      <div className="absolute flex flex-col" style={{ left: 64, top: 172, width: 431 }}>
        <span
          className="font-bold whitespace-nowrap text-[#1c1c30]"
          style={{ fontSize: 76, lineHeight: '80px' }}
        >
          Make her a
        </span>
        <span
          className="font-bold whitespace-nowrap text-[#1c1c30]"
          style={{ fontSize: 76, lineHeight: '80px' }}
        >
          mixtape
        </span>
      </div>

      <p
        className="absolute text-[#1c1c30]/80"
        style={{ left: 64, top: 475, width: 431, fontSize: 19, lineHeight: 1.5 }}
      >
        Blank tapes, new players and a Sunday swap meet.
      </p>

      <button
        type="button"
        className="absolute flex items-center justify-center rounded-lg font-bold text-[#fbe9d2]"
        style={{ left: 64, top: 539, width: 200, height: 58, background: '#1c1c30' }}
      >
        Buy blanks
      </button>

      <CassetteTape className="absolute" style={{ left: 559, top: 169 }} />

      <div
        className="absolute text-white"
        style={{ left: 1, top: 699, width: 319, height: 199, background: '#d34a5e' }}
      >
        <div style={{ position: 'absolute', left: 40, top: 76 }} className="text-left font-bold">
          <div style={{ fontSize: 26 }}>C60</div>
          <div style={{ fontSize: 17 }} className="font-normal">$3 each</div>
        </div>
      </div>

      <div
        className="absolute"
        style={{ left: 319, top: 699, width: 322, height: 199, background: '#eead4a' }}
      >
        <div style={{ position: 'absolute', left: 41, top: 76, color: '#1c1c30' }} className="text-left font-bold">
          <div style={{ fontSize: 26 }}>C90</div>
          <div style={{ fontSize: 17 }} className="font-normal">$4 each</div>
        </div>
      </div>

      <div
        className="absolute text-white"
        style={{ left: 639, top: 699, width: 321, height: 199, background: '#00788c' }}
      >
        <div style={{ position: 'absolute', left: 41, top: 76 }} className="text-left font-bold">
          <div style={{ fontSize: 26 }}>Chrome</div>
          <div style={{ fontSize: 17 }} className="font-normal">$6 each</div>
        </div>
      </div>

      <div
        className="absolute text-white"
        style={{ left: 959, top: 699, width: 319, height: 199, background: '#33658a' }}
      >
        <div style={{ position: 'absolute', left: 41, top: 76 }} className="text-left font-bold">
          <div style={{ fontSize: 26 }}>Metal</div>
          <div style={{ fontSize: 17 }} className="font-normal">$9 each</div>
        </div>
      </div>
    </main>
  )
}
