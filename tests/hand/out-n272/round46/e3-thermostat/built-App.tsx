import CircularThermostat from './components/CircularThermostat'

type Room = {
  name: string
  temp: string
  toggle: {
    x: number
    y: number
    w: number
    h: number
    inset: number
    translate: number
    knobW: number
    knobH: number
  }
  on: boolean
}

const rooms: Room[] = [
  { name: 'Living room', temp: '21°', toggle: { x: 334, y: 90, w: 57, h: 31, inset: 4, translate: 25, knobW: 24, knobH: 24 }, on: true },
  { name: 'Bedroom', temp: '18°', toggle: { x: 335, y: 175, w: 56, h: 31, inset: 4, translate: 21, knobW: 27, knobH: 24 }, on: false },
  { name: 'Kitchen', temp: '20°', toggle: { x: 335, y: 258, w: 56, h: 30, inset: 3, translate: 23, knobW: 27, knobH: 24 }, on: true },
  { name: 'Office', temp: '19°', toggle: { x: 335, y: 343, w: 56, h: 30, inset: 3, translate: 27, knobW: 23, knobH: 24 }, on: false },
  { name: 'Bathroom', temp: '23°', toggle: { x: 335, y: 427, w: 56, h: 30, inset: 3, translate: 26, knobW: 24, knobH: 24 }, on: true },
]

const rowCenters = [105, 189, 273, 357, 441]
const dividerYs = rowCenters.slice(0, -1).map((y, i) => (y + rowCenters[i + 1]) / 2)

function Toggle({
  w,
  h,
  inset,
  translate,
  knobW,
  knobH,
  on,
}: {
  w: number
  h: number
  inset: number
  translate: number
  knobW: number
  knobH: number
  on: boolean
}) {
  return (
    <div
      className="relative rounded-full"
      style={{ width: w, height: h, background: on ? '#fb7215' : '#4b5563' }}
    >
      <div
        className="absolute rounded-full bg-white"
        style={{
          width: knobW,
          height: knobH,
          top: inset,
          left: inset,
          transform: on ? `translateX(${translate}px)` : undefined,
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <main
      className="relative flow-root h-screen w-screen overflow-hidden"
      style={{ background: '#111827' }}
    >
      <div className="pt-12 pl-10">
        <h1 className="text-3xl font-bold text-white">Living room</h1>
        <p className="mt-1 flex gap-2 text-base font-normal text-white/70">
          <span>Heating</span>
          <span>schedule on</span>
        </p>
      </div>

      <div className="absolute" style={{ left: 166.3, top: 196.8, width: 486, height: 486 }}>
        <CircularThermostat />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-thin text-white" style={{ fontSize: 96, lineHeight: 1 }}>
            21°
          </span>
          <span className="mt-3 font-bold text-white" style={{ fontSize: 20 }}>
            Heating to 22°
          </span>
        </div>
      </div>

      <button
        aria-label="Decrease temperature"
        className="absolute flex items-center justify-center rounded-full text-2xl font-semibold text-white"
        style={{ left: 250.6, top: 759.2, width: 79, height: 80, background: '#1f2937' }}
      >
        −
      </button>
      <button
        aria-label="Increase temperature"
        className="absolute flex items-center justify-center rounded-full text-2xl font-semibold text-white"
        style={{ left: 489.2, top: 759.3, width: 81, height: 81, background: '#fb7215' }}
      >
        +
      </button>

      <section
        className="absolute"
        style={{
          left: 799,
          top: 179,
          width: 422,
          height: 522,
          background: '#1f2937',
          borderRadius: 0,
          boxSizing: 'border-box',
        }}
      >
        <h2 className="absolute font-bold text-white" style={{ left: 31, top: 30, fontSize: 20 }}>
          Rooms
        </h2>

        {rooms.map((room, i) => (
          <div
            key={room.name}
            className="absolute flex items-center justify-between"
            style={{ left: 31, top: rowCenters[i] - 12, width: 303 }}
          >
            <span className="font-medium text-white">{room.name}</span>
            <span className="text-white/70">{room.temp}</span>
          </div>
        ))}

        {rooms.map((room) => (
          <div
            key={`${room.name}-toggle`}
            className="absolute"
            style={{ left: room.toggle.x, top: room.toggle.y }}
          >
            <Toggle
              w={room.toggle.w}
              h={room.toggle.h}
              inset={room.toggle.inset}
              translate={room.toggle.translate}
              knobW={room.toggle.knobW}
              knobH={room.toggle.knobH}
              on={room.on}
            />
          </div>
        ))}

        {dividerYs.map((y) => (
          <div
            key={y}
            className="absolute bg-white/10"
            style={{ left: 31, top: y, width: 360, height: 1 }}
          />
        ))}
      </section>
    </main>
  )
}
