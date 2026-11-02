const timeLabels = ['8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm']

const staff = [
  { name: 'Maya', role: 'Barista' },
  { name: 'Tom', role: 'Barista' },
  { name: 'Ines', role: 'Kitchen' },
  { name: 'Sam', role: 'Kitchen' },
  { name: 'Ravi', role: 'Floor' },
  { name: 'Jo', role: 'Floor' },
]

const rowDividers = [180, 270, 360, 450, 540, 630, 720]

const shiftBlocks = [
  { x: 240, y: 210, w: 421, h: 51, color: '#2a9d8f', label: '8 to 2' },
  { x: 519, y: 300, w: 421, h: 52, color: '#f28c00', label: '10 to 4' },
  { x: 380, y: 390, w: 561, h: 52, color: '#3a86ff', label: '10 to 6' },
  { x: 800, y: 480, w: 420, h: 52, color: '#8338ec', label: '4 to 10' },
  { x: 660, y: 570, w: 561, h: 52, color: '#2a9d8f', label: '2 to 10' },
  { x: 240, y: 660, w: 281, h: 52, color: '#f28c00', label: '8 to 12' },
]

export default function App() {
  return (
    <main className="relative w-[1280px] h-[900px] bg-white overflow-hidden">
      <header
        className="absolute top-0 left-0 w-full flex items-center justify-between px-10 bg-[#2b2e45]"
        style={{ height: 76 }}
      >
        <span className="text-white font-bold text-2xl">Rota</span>
        <nav className="flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#" className="hover:text-white">Week</a>
          <a href="#" className="hover:text-white">People</a>
          <a href="#" className="hover:text-white">Swaps</a>
        </nav>
      </header>

      <h1
        className="absolute font-bold whitespace-nowrap text-[#1d2533]"
        style={{ left: 40, top: 102, fontSize: 30, lineHeight: '36px' }}
      >
        Thursday shifts
      </h1>

      <button
        className="absolute flex items-center justify-center rounded-lg font-bold text-white bg-[#f2243e]"
        style={{ left: 1040, top: 99, width: 200, height: 47 }}
      >
        Publish
      </button>

      <div
        className="absolute border-t border-[#dfe5ea]"
        style={{ left: 240, top: 190, width: 1000 }}
      />

      <div
        className="absolute flex items-center justify-between text-sm font-bold text-gray-500"
        style={{ left: 240, top: 182, width: 1000 }}
      >
        {timeLabels.map((label) => (
          <span key={label} className="whitespace-nowrap">
            {label}
          </span>
        ))}
      </div>

      {rowDividers.map((y) => (
        <div
          key={y}
          className="absolute border-t border-gray-200"
          style={{ left: 2, top: y, width: 1276 }}
        />
      ))}

      {staff.map((person, i) => (
        <div key={person.name} className="absolute" style={{ left: 40, top: 225 + i * 90 - 20 }}>
          <div className="font-semibold text-gray-900">{person.name}</div>
          <div className="text-sm text-gray-500">{person.role}</div>
        </div>
      ))}

      {shiftBlocks.map((block) => (
        <div
          key={block.label}
          className="absolute flex items-center rounded-md shadow-md border-b-2 border-black/10"
          style={{
            left: block.x,
            top: block.y,
            width: block.w,
            height: block.h,
            backgroundColor: block.color,
          }}
        >
          <span className="pl-4 text-sm font-semibold text-white whitespace-nowrap">
            {block.label}
          </span>
        </div>
      ))}

      <div
        className="absolute flex items-center bg-[#ecf1f4]"
        style={{ left: 2, top: 779, width: 1276, height: 119, paddingLeft: 198 }}
      >
        <span className="text-gray-700 font-medium">6 people, 42 hours, Cost $780</span>
      </div>
    </main>
  )
}
