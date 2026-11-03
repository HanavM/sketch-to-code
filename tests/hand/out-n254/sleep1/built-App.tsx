const DAYS = [
  { label: 'Mon', x: 130, y: 512, w: 91, h: 201, color: '#7b6cf6' },
  { label: 'Tue', x: 284, y: 542, w: 91, h: 170, color: '#7b6cf6' },
  { label: 'Wed', x: 440, y: 481, w: 91, h: 231, color: '#7b6cf6' },
  { label: 'Thu', x: 594, y: 571, w: 91, h: 141, color: '#7b6cf6' },
  { label: 'Fri', x: 749, y: 602, w: 91, h: 111, color: '#7b6cf6' },
  { label: 'Sat', x: 904, y: 461, w: 91, h: 251, color: '#ffb368' },
  { label: 'Sun', x: 1059, y: 497, w: 91, h: 216, color: '#7b6cf6' },
]

const STATS = [
  { label: 'Average', value: '7h 24m' },
  { label: 'Bedtime', value: '11:10' },
  { label: 'Woke up', value: '6:34' },
]

const CHART_X = 60
const CHART_Y = 439

export default function App() {
  return (
    <main
      className="relative w-full h-[900px] overflow-hidden"
      style={{ background: '#1a1833' }}
    >
      {/* nav */}
      <div className="absolute left-[60px] top-[40px] w-[1160px] flex items-center justify-between">
        <span className="font-bold text-lg text-[#ece9ff]">Drift</span>
        <div className="flex items-center gap-8 text-sm text-[#ece9ff]/70">
          <span>Week</span>
          <span>Month</span>
          <span>Goals</span>
        </div>
      </div>

      {/* heading */}
      <h1
        className="absolute left-[60px] whitespace-nowrap font-bold"
        style={{ top: '94px', fontSize: '60px', lineHeight: '72px', color: '#ece9ff' }}
      >
        You slept well this week
      </h1>

      {/* stat cards */}
      {STATS.map((stat, i) => (
        <div
          key={stat.label}
          className="absolute rounded-2xl px-4 pt-8"
          style={{
            left: `${60 + i * 225}px`,
            top: '269px',
            width: '201px',
            height: '122px',
            background: '#2c2757',
          }}
        >
          <div className="text-sm text-[#ece9ff]/60">{stat.label}</div>
          <div className="mt-1 text-2xl font-bold text-[#ece9ff]">{stat.value}</div>
        </div>
      ))}

      {/* sleep score ring */}
      <div
        className="absolute rounded-full"
        style={{
          left: '861px',
          top: '110px',
          width: '299px',
          height: '299px',
          background: 'conic-gradient(#ffb368 0% 78%, #332c61 78% 100%)',
        }}
      >
        <div
          className="absolute rounded-full flex flex-col items-center justify-center"
          style={{
            left: '20px',
            top: '20px',
            width: '259px',
            height: '259px',
            background: '#332c61',
          }}
        >
          <span className="text-6xl font-bold text-[#ece9ff]">78</span>
          <span className="mt-2 text-sm text-[#ece9ff]/60">Sleep score</span>
        </div>
      </div>

      {/* bar chart card */}
      <div
        className="absolute"
        style={{
          left: `${CHART_X}px`,
          top: `${CHART_Y}px`,
          width: '1161px',
          height: '322px',
          background: '#242050',
          borderRadius: 0,
          boxShadow: 'none',
          border: 'none',
        }}
      >
        {DAYS.map((day) => (
          <div key={day.label}>
            <div
              className="absolute"
              style={{
                left: `${day.x - CHART_X}px`,
                top: `${day.y - CHART_Y}px`,
                width: `${day.w}px`,
                height: `${day.h}px`,
                background: day.color,
              }}
            />
            <div
              className="absolute text-center text-sm text-[#ece9ff]/70"
              style={{
                left: `${day.x - CHART_X}px`,
                top: '296px',
                width: `${day.w}px`,
              }}
            >
              {day.label}
            </div>
          </div>
        ))}
      </div>

      {/* CTA button */}
      <button
        className="absolute rounded-xl font-bold flex items-center justify-center"
        style={{
          left: '60px',
          top: '789px',
          width: '240px',
          height: '57px',
          background: '#ffb368',
          color: '#1a1833',
        }}
      >
        Set a bedtime
      </button>

      {/* insight line */}
      <p className="absolute text-sm text-[#ece9ff]/70" style={{ left: '330px', top: '805px' }}>
        Friday was your shortest night, 4 hours 20.
      </p>
    </main>
  )
}
