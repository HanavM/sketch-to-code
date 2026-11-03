const stats = [
  { label: 'Average', value: '7h 24m' },
  { label: 'Bedtime', value: '11:10' },
  { label: 'Woke up', value: '6:34' },
]

const bars = [
  { day: 'Mon', x: 130, y: 512, h: 201, color: '#7b6cf6' },
  { day: 'Tue', x: 284, y: 542, h: 170, color: '#7b6cf6' },
  { day: 'Wed', x: 440, y: 481, h: 231, color: '#7b6cf6' },
  { day: 'Thu', x: 594, y: 571, h: 141, color: '#7b6cf6' },
  { day: 'Fri', x: 749, y: 602, h: 111, color: '#7b6cf6' },
  { day: 'Sat', x: 904, y: 461, h: 251, color: '#ffb368' },
  { day: 'Sun', x: 1059, y: 497, h: 216, color: '#7b6cf6' },
]

export default function App() {
  return (
    <main className="relative mx-auto h-[900px] w-[1280px] overflow-hidden bg-[#1a1833]">
      <header className="absolute left-[60px] top-[30px] flex w-[1161px] items-center justify-between">
        <span className="text-xl font-bold text-[#ece9ff]">Drift</span>
        <nav className="flex items-center gap-8 text-sm font-medium text-[#ece9ff] opacity-70">
          <a href="#">Week</a>
          <a href="#">Month</a>
          <a href="#">Goals</a>
        </nav>
      </header>

      <h1
        className="absolute left-[60px] whitespace-nowrap font-bold text-[#ece9ff]"
        style={{ top: '95px', fontSize: '55px', lineHeight: 1.2 }}
      >
        You slept well this week
      </h1>

      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="absolute flex h-[122px] w-[201px] flex-col justify-center gap-1 rounded-xl bg-[#2c2757] pl-[15px]"
          style={{ left: `${60 + i * 225}px`, top: '269px' }}
        >
          <span className="text-sm text-[#ece9ff] opacity-70">{stat.label}</span>
          <span className="text-2xl font-bold text-[#ece9ff]">{stat.value}</span>
        </div>
      ))}

      <div
        className="absolute flex flex-col items-center justify-center rounded-full bg-[#332c61]"
        style={{
          left: '861px',
          top: '110px',
          width: '299px',
          height: '299px',
          boxSizing: 'border-box',
          border: '14px solid #ffb368',
        }}
      >
        <span className="text-6xl font-bold text-[#ece9ff]">78</span>
        <span className="mt-2 text-sm text-[#ece9ff] opacity-70">sleep score</span>
      </div>

      <div
        className="absolute bg-[#242050]"
        style={{ left: '60px', top: '439px', width: '1161px', height: '322px', borderRadius: 0 }}
      />

      {bars.map((bar) => (
        <div
          key={bar.day}
          className="absolute rounded-t-md"
          style={{
            left: `${bar.x}px`,
            top: `${bar.y}px`,
            width: '91px',
            height: `${bar.h}px`,
            backgroundColor: bar.color,
          }}
        />
      ))}

      {bars.map((bar) => (
        <span
          key={`${bar.day}-label`}
          className="absolute text-center text-sm font-medium text-[#ece9ff] opacity-70"
          style={{ left: `${bar.x}px`, top: '735px', width: '91px' }}
        >
          {bar.day}
        </span>
      ))}

      <p
        className="absolute text-sm text-[#9b96c4]"
        style={{ left: '330px', top: '815px' }}
      >
        Friday was your shortest night, 4 hours 20.
      </p>

      <button
        className="absolute rounded-xl bg-[#ffb368] font-bold text-[#1a1833]"
        style={{ left: '60px', top: '789px', width: '240px', height: '57px' }}
      >
        Set a bedtime
      </button>
    </main>
  )
}
