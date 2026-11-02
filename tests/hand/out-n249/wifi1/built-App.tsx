import BarChart from './components/BarChart'

const navItems = ['Devices', 'Guests', 'Parental', 'Settings']

const devices = [
  { name: 'Living room TV', ip: '192.168.1.14', usage: '3.2 GB', on: true },
  { name: "Hanna's phone", ip: '192.168.1.20', usage: '840 MB', on: true },
  { name: 'Work laptop', ip: '192.168.1.31', usage: '5.6 GB', on: true },
  { name: 'Printer', ip: '192.168.1.42', usage: '12 MB', on: false },
  { name: 'Thermostat', ip: '192.168.1.50', usage: '4 MB', on: true },
  { name: 'Game console', ip: '192.168.1.66', usage: '9.1 GB', on: false },
]

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className={`w-[64px] h-[36px] rounded-full flex items-center shrink-0 ${
        on ? 'bg-[#2a9d8f] justify-end' : 'bg-[#e4e7ee] justify-start'
      }`}
      style={{ padding: 4 }}
    >
      <div className="w-[28px] h-[28px] rounded-full bg-white shadow" />
    </div>
  )
}

export default function App() {
  return (
    <main className="relative w-[1280px] h-[900px] overflow-hidden bg-[#f5f6fa]">
      {/* sidebar */}
      <aside className="absolute left-0 top-0 w-[220px] h-[900px] bg-white">
        <div className="absolute left-[30px] top-[28px] text-xl font-bold text-[#0a7aff]">
          HomeNet
        </div>
        <nav className="absolute left-[30px] top-[86px] flex flex-col gap-[6px]">
          {navItems.map((item, i) => (
            <div
              key={item}
              className={`h-[38px] flex items-center px-3 rounded-lg text-sm font-medium ${
                i === 0 ? 'bg-[#eaf3ff] text-[#0a7aff]' : 'text-[#5b6472]'
              }`}
            >
              {item}
            </div>
          ))}
        </nav>
      </aside>

      {/* heading */}
      <h1
        className="absolute left-[260px] whitespace-nowrap font-bold text-[#1e2436]"
        style={{ top: 35, fontSize: 33, lineHeight: '39.6px' }}
      >
        Devices on your wifi
      </h1>

      {/* download card */}
      <div
        className="absolute flex flex-col justify-center rounded-2xl bg-[#0a7aff] p-6"
        style={{ left: 260, top: 99, width: 480, height: 132 }}
      >
        <div className="text-sm font-medium text-white/70">Download now</div>
        <div className="mt-1 text-[48px] font-bold leading-none text-white whitespace-nowrap">
          412 Mbps
        </div>
      </div>

      {/* upload card */}
      <div
        className="absolute flex flex-col justify-center rounded-2xl bg-white border border-[#dfe3ea] p-6"
        style={{ left: 759, top: 99, width: 241, height: 131 }}
      >
        <div className="text-sm font-medium text-gray-400">Upload</div>
        <div className="mt-1 text-[44px] font-bold leading-none text-[#1e2436] whitespace-nowrap">
          38 Mbps
        </div>
      </div>

      {/* bar chart card */}
      <div
        className="absolute rounded-2xl overflow-hidden bg-[#dfe3ea]"
        style={{ left: 1019, top: 99, width: 221, height: 131 }}
      >
        <div className="absolute bg-[#0a7aff]" style={{ left: 41, top: 90, width: 26, height: 21 }} />
        <div className="absolute bg-[#0a7aff]" style={{ left: 79, top: 65, width: 26, height: 45 }} />
        <div className="absolute bg-[#0a7aff]" style={{ left: 116, top: 40, width: 27, height: 70 }} />
        <div className="absolute border border-[#ccd2e0] bg-white" style={{ left: 154, top: 19, width: 28, height: 91 }} />
        <BarChart className="w-full h-full" />
      </div>

      {/* devices panel */}
      <div
        className="absolute rounded-2xl bg-white border border-[#dfe3ea]"
        style={{ left: 259, top: 259, width: 982, height: 562 }}
      >
        <div className="absolute left-[31px] top-[24px] text-xl font-bold text-[#1e2436]">
          6 connected
        </div>

        {devices.map((device, i) => (
          <div
            key={device.name}
            className="absolute flex items-center pl-[31px] pr-[37px]"
            style={{ left: 0, top: 344 + i * 82 - 41 - 259, width: 982, height: 82 }}
          >
            <div className="w-[45px] h-[45px] rounded-xl bg-[#e4572e] shrink-0" />
            <div className="ml-4 flex-1 min-w-0">
              <div className="font-semibold text-[#1e2436]">{device.name}</div>
              <div className="text-sm text-gray-400">{device.ip}</div>
            </div>
            <div className="mr-6 text-sm text-gray-500 whitespace-nowrap">
              {device.usage}
            </div>
            <Toggle on={device.on} />
          </div>
        ))}
      </div>

      {/* restart button */}
      <button
        className="absolute rounded-lg bg-[#1e2436] font-bold text-white"
        style={{ left: 260, top: 835, width: 181, height: 47 }}
      >
        Restart router
      </button>
    </main>
  )
}
