const staff = [
  { name: 'Maya', role: 'Barista' },
  { name: 'Tom', role: 'Barista' },
  { name: 'Ines', role: 'Kitchen' },
  { name: 'Sam', role: 'Kitchen' },
  { name: 'Ravi', role: 'Floor' },
  { name: 'Jo', role: 'Floor' },
]

const timeSlots = ['8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm']

const shifts = [
  { label: '8 to 2', x: 240, y: 210, w: 421, h: 51, color: '#2a9d8f' },
  { label: '10 to 4', x: 519, y: 300, w: 421, h: 52, color: '#f28c00' },
  { label: '10 to 6', x: 380, y: 390, w: 561, h: 52, color: '#3a86ff' },
  { label: '4 to 10', x: 800, y: 480, w: 420, h: 52, color: '#8338ec' },
  { label: '2 to 10', x: 660, y: 570, w: 561, h: 52, color: '#2a9d8f' },
  { label: '8 to 12', x: 240, y: 660, w: 281, h: 52, color: '#f28c00' },
]

export default function App() {
  return (
    <main className="relative w-full h-[900px] bg-white overflow-hidden">
      <header
        className="absolute left-0 top-0 w-full flex items-center justify-between px-10"
        style={{ height: 76, backgroundColor: '#2b2e45' }}
      >
        <span className="text-white font-bold text-xl">Rota</span>
        <nav className="flex items-center gap-8">
          <a className="text-white font-bold text-sm">Week</a>
          <a className="text-white font-bold text-sm">People</a>
          <a className="text-white font-bold text-sm">Swaps</a>
        </nav>
      </header>

      <h1
        className="absolute font-bold whitespace-nowrap"
        style={{ left: 40, top: 102, fontSize: 30, lineHeight: '36px', color: '#1d2533' }}
      >
        Thursday shifts
      </h1>

      <button
        className="absolute rounded-lg text-white font-bold shadow-md flex items-center justify-center"
        style={{ left: 1040, top: 99, width: 200, height: 47, backgroundColor: '#f2243e' }}
      >
        Publish
      </button>

      <div
        className="absolute"
        style={{ left: 240, top: 190, width: 1000, height: 1, backgroundColor: '#dfe5ea' }}
      />

      <div
        className="absolute flex justify-between text-gray-500 font-bold text-sm whitespace-nowrap"
        style={{ left: 240, top: 190, width: 1000, transform: 'translateY(-50%)' }}
      >
        {timeSlots.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      {staff.map((s, i) => (
        <div
          key={s.name}
          className="absolute flex items-baseline gap-2 border-b"
          style={{ left: 2, top: 206 + i * 36, width: 1276, height: 36, borderColor: '#dfe5ea' }}
        >
          <span className="font-semibold text-sm" style={{ marginLeft: 38, color: '#1d2533' }}>
            {s.name}
          </span>
          <span className="text-gray-400 text-xs">{s.role}</span>
        </div>
      ))}

      {shifts.map((sh) => (
        <div
          key={sh.label}
          className="absolute rounded-md shadow-md flex items-center text-white font-semibold text-sm whitespace-nowrap"
          style={{
            left: sh.x,
            top: sh.y,
            width: sh.w,
            height: sh.h,
            backgroundColor: sh.color,
            paddingLeft: 14,
          }}
        >
          {sh.label}
        </div>
      ))}

      <div
        className="absolute"
        style={{ left: 2, top: 779, width: 1276, height: 119, backgroundColor: '#ecf1f4' }}
      >
        <p
          className="absolute font-semibold text-base"
          style={{ left: 198, top: 61, color: '#1d2533' }}
        >
          6 people, 42 hours, Cost $780
        </p>
      </div>
    </main>
  )
}
