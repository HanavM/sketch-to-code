const sliders = [
  { label: 'Loan amount', value: '$24,000', trackY: 268, fillWidth: 290, knobCenterX: 354.5, hasTrack: false, labelColor: '#069a6b' },
  { label: 'Term', value: '60 months', trackY: 388, fillWidth: 410, knobCenterX: 473.5, hasTrack: true, labelColor: undefined },
  { label: 'Interest rate', value: '6.4%', trackY: 508, fillWidth: 170, knobCenterX: 234.5, hasTrack: true, labelColor: undefined },
  { label: 'Down payment', value: '$4,000', trackY: 628, fillWidth: 110, knobCenterX: 174, hasTrack: true, labelColor: '#069a6b' },
]

export default function App() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-white">
      <header className="absolute inset-x-0 top-0 flex h-[69px] items-center justify-between border-b border-[#e5e7eb] px-[50px]">
        <span className="text-lg font-bold text-gray-900">Harbor Bank</span>
        <nav className="flex gap-8 text-sm font-medium text-gray-800">
          <a href="#">Loans</a>
          <a href="#">Savings</a>
          <a href="#">Help</a>
        </nav>
      </header>

      <h1 className="absolute left-[50px] top-[108px] text-4xl font-bold text-gray-900">
        Car loan calculator
      </h1>

      {sliders.map((s) => (
        <div key={s.label} className="absolute" style={{ left: 50, top: s.trackY - 39, width: 580 }}>
          <div className="flex items-end justify-between" style={{ width: 580 }}>
            <span className="text-sm font-medium text-gray-700" style={{ color: s.labelColor }}>
              {s.label}
            </span>
            <span className="text-2xl font-bold text-gray-900">{s.value}</span>
          </div>
        </div>
      ))}

      <div className="absolute" style={{ left: 50, top: 256, width: 437, height: 384 }}>
        {sliders.map((s) => {
          const trackYRel = s.trackY - 256
          const knobLeft = s.knobCenterX - 50 - 13
          const knobTop = trackYRel - 13
          return (
            <div key={s.label}>
              {s.hasTrack && (
                <>
                  <div
                    className="absolute left-0 rounded-full bg-gray-200"
                    style={{ top: trackYRel - 4, width: 437, height: 8 }}
                  />
                  <div
                    className="absolute left-0 rounded-full bg-[#069a6b]"
                    style={{ top: trackYRel - 4, width: s.fillWidth, height: 8 }}
                  />
                </>
              )}
              <div
                className="absolute rounded-full border-2 border-white bg-[#069a6b]"
                style={{ left: knobLeft, top: knobTop, width: 26, height: 26 }}
              />
            </div>
          )
        })}
      </div>

      <div
        className="absolute rounded-lg border border-[#e2e8f0]"
        style={{
          left: 739,
          top: 109,
          width: 492,
          height: 622,
          boxSizing: 'border-box',
          background: '#e9fbf3',
        }}
      >
        <div className="absolute" style={{ left: 41, top: 50 }}>
          <span className="text-sm text-gray-700">Monthly payment</span>
        </div>
        <div className="absolute" style={{ left: 41, top: 96 }}>
          <span className="text-5xl font-bold" style={{ color: '#065f46' }}>
            $469
          </span>
        </div>
        <div className="absolute" style={{ left: 41, top: 156 }}>
          <span className="text-sm text-gray-700">for 60 months</span>
        </div>

        <div
          className="absolute rounded-l-full"
          style={{ left: 41, top: 204, width: 345, height: 29, background: '#069a6b' }}
        />
        <div
          className="absolute rounded-r-full"
          style={{ left: 385, top: 204, width: 67, height: 29, background: '#fbbf24' }}
        />

        <div className="absolute" style={{ left: 61, top: 268 }}>
          <span className="text-sm text-gray-900">Principal $24,000</span>
        </div>
        <div className="absolute" style={{ left: 61, top: 298 }}>
          <span className="text-sm text-gray-900">Interest $4,140</span>
        </div>
        <div className="absolute" style={{ left: 41, top: 328 }}>
          <span className="text-sm font-semibold text-gray-900">Total $28,140</span>
        </div>

        <button
          className="absolute rounded-md font-bold text-white"
          style={{ left: 40, top: 530, width: 411, height: 62, background: '#069a6b' }}
        >
          Apply for this loan
        </button>
      </div>
    </main>
  )
}
