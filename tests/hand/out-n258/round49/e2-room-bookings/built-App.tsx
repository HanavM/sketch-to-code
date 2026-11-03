import SketchShape from './components/SketchShape'

const rooms = [
  { name: 'Aspen', y: 236 },
  { name: 'Birch', y: 336 },
  { name: 'Cedar', y: 436 },
  { name: 'Dogwood', y: 536 },
  { name: 'Elm', y: 636 },
  { name: 'Fir', y: 736 },
]

const times = ['9', '10', '11', '12', '1', '2', '3', '4', '5']

const bookings = [
  { label: 'Design', x: 224, y: 227, w: 213, h: 65, color: '#3b86ff' },
  { label: 'Sales', x: 443, y: 428, w: 103, h: 65, color: '#3b86ff' },
  { label: '1:1', x: 664, y: 227, w: 158, h: 65, color: '#ff0066' },
  { label: 'Interview', x: 554, y: 527, w: 213, h: 65, color: '#ff0066' },
  { label: 'All hands', x: 334, y: 327, w: 322, h: 65, color: '#8338ec', align: 'left' as const },
  { label: 'Planning', x: 884, y: 627, w: 212, h: 66, color: '#8338ec' },
  { label: 'Standup', x: 224, y: 427, w: 103, h: 66, color: '#ff5508' },
  { label: 'Offsite prep', x: 663, y: 727, w: 433, h: 66, color: '#ff5508' },
  { label: 'Workshop', x: 773, y: 427, w: 323, h: 66, color: '#08a87c', align: 'left' as const },
  { label: 'Review', x: 334, y: 627, w: 158, h: 66, color: '#08a87c' },
]

export default function App() {
  return (
    <main className="relative min-h-[900px] bg-white flow-root">
      <header className="relative h-[64px] bg-[#1e2535] flex flex-col justify-center px-6">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3b86ff]" />
          <span className="text-xl font-bold text-white leading-tight">Meeting rooms, Thursday</span>
        </div>
        <svg
          width="37"
          height="36"
          viewBox="0 0 37 37"
          className="absolute"
          style={{ left: 1200, top: 14 }}
        >
          <path
            d="M17.5 1 C19.5 3 35 17 35 18.3 C35 19.6 19 35 17.8 35.3 C16.5 35.6 2 20.5 1.2 18.8 C0.6 17.5 15 2.3 17.5 1 Z"
            fill="#ffc010"
          />
        </svg>
      </header>

      <div className="absolute bg-[#1e2535]" style={{ left: 2, top: 63, width: 1276, height: 2 }} />

      <span
        className="absolute text-xs font-semibold uppercase tracking-widest text-[#1e2535]"
        style={{ left: 40, top: 76 }}
      >
        Roomly
      </span>

      <div className="absolute flex" style={{ left: 220, top: 165, width: 980, height: 32 }}>
        {times.map((t) => (
          <span key={t} className="flex-1 text-center text-xs font-semibold text-gray-600">
            {t}
          </span>
        ))}
      </div>

      <button
        className="absolute rounded-md bg-[#3b86ff] text-white font-medium"
        style={{ left: 1039, top: 91, width: 161, height: 47 }}
      >
        Book a room
      </button>

      {/* schedule grid */}
      <div className="absolute" style={{ left: 40, top: 210, width: 1160, height: 600 }}>
        <div className="absolute bg-[#dddddd]" style={{ left: 180, top: 0, width: 1, height: 600 }} />
        <div className="absolute bg-[#dddddd]" style={{ left: 0, top: 100, width: 1160, height: 1 }} />

        {rooms.map((room) => (
          <span
            key={room.name}
            className="absolute text-base font-semibold text-gray-700"
            style={{ left: 0, top: room.y - 210 }}
          >
            {room.name}
          </span>
        ))}

        {bookings.map((b) => (
          <div
            key={b.label}
            className={`absolute rounded-md flex items-center px-3 ${
              b.align === 'left' ? 'justify-start' : 'justify-center'
            }`}
            style={{ left: b.x - 40, top: b.y - 210, width: b.w, height: b.h, backgroundColor: b.color }}
          >
            <span className="text-sm font-medium text-white whitespace-nowrap">{b.label}</span>
          </div>
        ))}
      </div>

      <p className="absolute text-sm text-gray-500" style={{ left: 40, top: 828 }}>
        6 rooms, 10 bookings, 3 free right now
      </p>
    </main>
  )
}
