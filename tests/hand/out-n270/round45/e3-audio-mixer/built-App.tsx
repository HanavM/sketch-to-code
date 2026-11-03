const meterHeights = [
  55, 40, 80, 105, 65, 30, 90, 120, 50, 70, 110, 35, 75, 95, 60, 125, 45, 85,
  65, 100, 40, 72, 115, 55, 80, 32, 95, 62, 78,
]

const channels = [
  { name: 'Drums', handleTop: 181 },
  { name: 'Bass', handleTop: 261 },
  { name: 'Keys', handleTop: 320 },
  { name: 'Guitar', handleTop: 220 },
  { name: 'Vocals', handleTop: 151 },
  { name: 'FX', handleTop: 381, handleLeft: 51 },
]

function ChannelStrip({
  name,
  left,
  handleTop,
  handleLeft = 36,
}: {
  name: string
  left: number
  handleTop: number
  handleLeft?: number
}) {
  return (
    <div
      className="absolute"
      style={{ left, top: 269, width: 131, height: 601, background: '#23252a' }}
    >
      <div
        className="absolute"
        style={{
          left: 35,
          top: 21,
          width: 60,
          height: 59,
          borderRadius: '50%',
          border: '4px solid #4a5563',
          boxSizing: 'border-box',
          background: 'transparent',
        }}
      />
      <div
        className="absolute"
        style={{ left: 61, top: 111, width: 8, height: 380, background: '#000' }}
      />
      <div
        className="absolute"
        style={{
          left: handleLeft,
          top: handleTop,
          width: 60,
          height: 31,
          border: '1px solid #d1d5db',
          background: '#23252a',
        }}
      />
      <div
        className="absolute font-bold text-white text-center"
        style={{ left: 0, top: 551, width: 131 }}
      >
        {name}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <main className="min-h-screen w-full bg-[#17181c]">
      <div className="relative mx-auto overflow-hidden" style={{ width: 1280, height: 900 }}>
        <div
          className="absolute flex items-center px-6"
          style={{ left: 1, top: 1, width: 1277, height: 64, background: '#23252a' }}
        >
          <div
            className="absolute"
            style={{ left: 0, top: 0, width: 2, height: 64, background: '#2ecc71' }}
          />
          <span className="font-bold text-white text-lg">Session 07</span>
          <span className="font-mono ml-10" style={{ color: '#2ecc71' }}>
            01:42.08
          </span>
        </div>
        <div
          className="absolute rounded-full"
          style={{ left: 560, top: 11, width: 39, height: 40, background: '#2ecc71', boxSizing: 'border-box' }}
        />
        <div
          className="absolute rounded-full"
          style={{ left: 620, top: 11, width: 39, height: 40, background: '#f04444', boxSizing: 'border-box' }}
        />

        <div
          className="absolute flex items-end gap-[28px] py-2 px-4"
          style={{ left: 29, top: 89, width: 1221, height: 152, background: '#23252a' }}
        >
          {meterHeights.map((h, i) => (
            <div
              key={i}
              className="w-[4px]"
              style={{ height: h, background: '#3b82f6', color: '#3b82f6' }}
            />
          ))}
        </div>
        <div
          className="absolute"
          style={{ left: 73, top: 180, width: 2, height: 40, background: '#3b82f6', color: '#3b82f6' }}
        />
        <div
          className="absolute"
          style={{ left: 113, top: 140, width: 2, height: 80, background: '#3b82f6', color: '#3b82f6' }}
        />

        {channels.map((c, i) => (
          <ChannelStrip
            key={c.name}
            name={c.name}
            left={29 + i * 147}
            handleTop={c.handleTop}
            handleLeft={c.handleLeft}
          />
        ))}

        <div
          className="absolute"
          style={{ left: 1079, top: 269, width: 172, height: 601, background: '#2c2545' }}
        >
          <div
            className="absolute w-[8px]"
            style={{ left: 82, top: 111, height: 380, background: '#000' }}
          />
          <div
            className="absolute"
            style={{ left: 51, top: 201, width: 71, height: 35, background: '#a78bfa' }}
          />
          <div
            className="absolute font-bold text-white text-center"
            style={{ left: 0, top: 551, width: 172 }}
          >
            Master
          </div>
        </div>
      </div>
    </main>
  )
}
