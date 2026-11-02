import SignalStrength from './components/SignalStrength'

const navItems = ['Devices', 'Guests', 'Parental', 'Settings']

const devices = [
  { name: 'Living room TV', ip: '192.168.1.14', usage: '3.2 GB', on: true },
  { name: "Hanna's phone", ip: '192.168.1.20', usage: '840 MB', on: true },
  { name: 'Work laptop', ip: '192.168.1.31', usage: '5.6 GB', on: true },
  { name: 'Printer', ip: '192.168.1.42', usage: '12 MB', on: false },
  { name: 'Thermostat', ip: '192.168.1.50', usage: '4 MB', on: true },
  { name: 'Game console', ip: '192.168.1.66', usage: '9.1 GB', on: false },
]

export default function App() {
  return (
    <main className="relative w-full h-[900px] bg-[#f5f6fa] overflow-hidden">
      {/* sidebar */}
      <div className="absolute left-[1px] top-[2px] w-[220px] h-[896px] bg-white" />
      <div className="absolute left-[30px] top-[28px] text-xl font-bold text-[#0a7aff]">HomeNet</div>
      <nav className="absolute left-[30px] top-[86px] flex flex-col gap-[6px]">
        {navItems.map((item, i) => (
          <a
            key={item}
            href="#"
            className={`h-[38px] flex items-center text-sm ${
              i === 0 ? 'font-semibold text-[#0a7aff]' : 'text-[#1e2436]/70'
            }`}
          >
            {item}
          </a>
        ))}
      </nav>

      {/* heading */}
      <h1 className="absolute left-[260px] top-[35px] text-[33px] font-bold leading-[1.2] text-[#1e2436] whitespace-nowrap">
        Devices on your wifi
      </h1>

      {/* stat card: download */}
      <div className="absolute left-[260px] top-[99px] w-[480px] h-[132px] rounded-lg bg-[#0a7aff] shadow-sm px-6 flex flex-col justify-center">
        <span className="text-sm text-white/70">Download now</span>
        <span className="text-[48px] font-bold leading-none text-white whitespace-nowrap">412 Mbps</span>
      </div>

      {/* stat card: upload */}
      <div className="absolute left-[759px] top-[99px] w-[241px] h-[131px] rounded-lg bg-white border border-[#dfe3ea] shadow-sm px-6 flex flex-col justify-center">
        <span className="text-sm text-[#8a93a6]">Upload</span>
        <span className="text-[44px] font-bold leading-none text-[#1e2436] whitespace-nowrap">38 Mbps</span>
      </div>

      {/* stat card: signal strength */}
      <div className="absolute left-[1019px] top-[99px] w-[221px] h-[131px] rounded-lg bg-[#dfe3ea] overflow-hidden">
        <SignalStrength className="absolute inset-0 w-full h-full" />
        <div className="absolute left-[41px] top-[91px] w-[26px] h-[21px] bg-[#0a7aff]" />
        <div className="absolute left-[79px] top-[66px] w-[26px] h-[45px] bg-[#0a7aff]" />
        <div className="absolute left-[116px] top-[41px] w-[27px] h-[70px] bg-[#0a7aff]" />
        <div className="absolute left-[154px] top-[20px] w-[28px] h-[91px] border border-[#ccd2e0] rounded-sm" />
      </div>

      {/* device list panel */}
      <div className="absolute left-[259px] top-[259px] w-[982px] h-[562px] rounded-lg bg-white border border-[#dfe3ea]">
        <h2 className="absolute left-[24px] top-[20px] text-lg font-bold text-[#1e2436]">6 connected</h2>
        {devices.map((d, i) => (
          <div
            key={d.name}
            className="absolute left-0 w-full h-[82px] border-b border-[#f0f1f5] last:border-b-0"
            style={{ top: `${44 + i * 82}px` }}
          >
            <div className="absolute left-[31px] top-1/2 -translate-y-1/2 w-[45px] h-[45px] rounded-lg bg-[#e4572e]" />
            <div className="absolute left-[92px] top-1/2 -translate-y-1/2 flex flex-col gap-[2px]">
              <span className="text-sm font-medium text-[#1e2436]">{d.name}</span>
              <span className="text-xs text-[#9aa1b1]">{d.ip}</span>
            </div>
            <span className="absolute right-[113px] top-1/2 -translate-y-1/2 text-sm text-[#1e2436]">
              {d.usage}
            </span>
            <div
              className={`absolute left-[881px] top-1/2 -translate-y-1/2 w-[64px] h-[36px] rounded-full ${
                d.on ? 'bg-[#2a9d8f]' : 'bg-[#dfe3ea]'
              }`}
            >
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-[28px] h-[28px] rounded-full bg-white transition-all ${
                  d.on ? 'left-[32px]' : 'left-[4px]'
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* restart button */}
      <button className="absolute left-[260px] top-[835px] w-[181px] h-[47px] rounded-lg bg-[#1e2436] text-sm font-bold text-white">
        Restart router
      </button>
    </main>
  )
}
