const strips = [
  { label: 'Drums', x: 29, handle: { x: 36, y: 181, w: 60, h: 31 } },
  { label: 'Bass', x: 176, handle: { x: 39, y: 261, w: 60, h: 31 } },
  { label: 'Keys', x: 323, handle: { x: 41, y: 320, w: 61, h: 31 } },
  { label: 'Guitar', x: 470, handle: { x: 45, y: 220, w: 61, h: 31 } },
  { label: 'Vocals', x: 617, handle: { x: 48, y: 151, w: 60, h: 30 } },
  { label: 'FX', x: 764, handle: { x: 51, y: 381, w: 60, h: 31 } },
]

const meterHeights = [
  38, 72, 50, 95, 60, 110, 45, 128, 70, 55, 90, 35, 115, 65, 100, 48, 80, 120,
  42, 95, 58, 105, 30, 88, 60, 75, 110, 40, 65,
]

export default function App() {
  return (
    <main className="relative w-[1280px] h-[900px] bg-[#17181c] overflow-hidden">
      <div className="absolute left-[1px] top-[1px] w-[1277px] h-[64px] bg-[#23252a] flex items-center px-6">
        <span className="text-white font-bold text-lg">Session 07</span>
        <div className="absolute left-[560px] top-[11px] w-[39px] h-[40px] rounded-full bg-[#2ecc71]" />
        <div className="absolute left-[620px] top-[11px] w-[39px] h-[40px] rounded-full bg-[#f04444]" />
        <span className="absolute left-[760px] top-1/2 -translate-y-1/2 text-[#4ade80] font-mono text-sm">
          01:42.08
        </span>
      </div>

      <div className="absolute left-[29px] top-[89px] w-[1222px] h-[152px] bg-[#23252a] flex items-end justify-between px-4 pb-[21px]">
        {meterHeights.map((h, i) => (
          <div key={i} className="w-[4px] bg-[#3b82f6]" style={{ height: h }} />
        ))}
        <div className="absolute w-[6px] bg-[#3b82f6]" style={{ left: 44, top: 91, height: 40 }} />
        <div className="absolute w-[6px] bg-[#3b82f6]" style={{ left: 84, top: 51, height: 80 }} />
      </div>

      {strips.map((s) => (
        <div
          key={s.label}
          className="absolute top-[269px] w-[131px] h-[601px] bg-[#23252a]"
          style={{ left: s.x }}
        >
          <div
            className="absolute rounded-full"
            style={{
              left: 35,
              top: 21,
              width: 60,
              height: 59,
              boxSizing: 'border-box',
              border: '4px solid #4a5563',
            }}
          />
          {s.label === 'Bass' ? (
            <div className="absolute left-[63px] top-[111px] w-[6px] h-[380px] bg-black" />
          ) : (
            <div className="absolute left-[66px] top-[111px] w-[2px] h-[380px] bg-[#4a5563]" />
          )}
          <div
            className="absolute rounded-sm bg-white"
            style={{
              left: s.handle.x,
              top: s.handle.y,
              width: s.handle.w,
              height: s.handle.h,
              border: '1px solid #d1d5db',
            }}
          />
          <div className="absolute left-0 top-[551px] w-full text-center text-gray-300 text-sm">
            {s.label}
          </div>
        </div>
      ))}

      <div className="absolute left-[1079px] top-[269px] w-[172px] h-[601px] bg-[#2c2545]">
        <div className="absolute left-[83px] top-[14px] w-[6px] h-[572px] bg-black" />
        <div
          className="absolute rounded-sm bg-[#a78bfa]"
          style={{ left: 51, top: 201, width: 71, height: 35 }}
        />
        <div className="absolute left-0 top-[551px] w-full text-center text-white font-bold text-sm">
          Master
        </div>
      </div>
    </main>
  )
}
