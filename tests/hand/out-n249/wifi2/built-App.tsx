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

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f5f6fa] flex">
      <aside className="w-[220px] h-full bg-white shrink-0 flex flex-col">
        <div className="pl-[29px] pt-[28px] text-xl font-bold text-[#0a7aff]">
          HomeNet
        </div>
        <nav className="pt-[18px] flex flex-col">
          {navItems.map((item) => (
            <div
              key={item}
              className={`h-[38px] mb-[6px] mx-[10px] flex items-center pl-[19px] rounded-lg text-[15px] ${
                item === 'Devices'
                  ? 'bg-blue-50 text-[#0a7aff] font-semibold'
                  : 'text-gray-500'
              }`}
            >
              {item}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 px-[40px] pt-[38px]">
        <h1
          className="text-[33px] font-bold leading-tight whitespace-nowrap text-[#1e2436]"
          style={{ color: '#1e2436' }}
        >
          Devices on your wifi
        </h1>

        <div className="mt-[26px] flex gap-[19px]">
          <div className="w-[480px] h-[132px] rounded-2xl bg-[#0a7aff] px-[24px] pt-[22px]">
            <div className="text-sm font-medium text-white/70">Download now</div>
            <div className="text-[48px] font-bold text-white leading-none mt-2 whitespace-nowrap">
              412 Mbps
            </div>
          </div>

          <div className="w-[241px] h-[131px] rounded-2xl bg-white border border-[#dfe3ea] px-[24px] pt-[22px]">
            <div className="text-sm font-medium text-gray-400">Upload</div>
            <div className="text-[44px] font-bold text-[#1e2436] leading-none mt-2 whitespace-nowrap">
              38 Mbps
            </div>
          </div>

          <div className="relative w-[221px] h-[131px] rounded-2xl overflow-hidden bg-[#dfe3ea]">
            <BarChart className="absolute inset-0 text-[#0a7aff]" />
            <div
              className="absolute bg-[#0a7aff]"
              style={{ left: 41, top: 90, width: 26, height: 21 }}
            />
            <div
              className="absolute bg-[#0a7aff]"
              style={{ left: 79, top: 65, width: 26, height: 45 }}
            />
            <div
              className="absolute bg-[#0a7aff]"
              style={{ left: 116, top: 40, width: 27, height: 70 }}
            />
            <div
              className="absolute rounded-sm border border-[#ccd2e0] bg-white"
              style={{ left: 154, top: 19, width: 28, height: 91 }}
            />
          </div>
        </div>

        <div className="relative mt-[28px] w-[982px] h-[562px] rounded-2xl bg-white border border-[#dfe3ea]">
          <div className="absolute left-[31px] top-[24px] text-lg font-bold text-[#1e2436]">
            6 connected
          </div>

          {devices.map((d, i) => {
            const centerY = 85 + i * 82
            return (
              <div
                key={d.name}
                className="absolute left-0 w-full"
                style={{ top: centerY - 41, height: 82 }}
              >
                <div className="relative h-full">
                  <div
                    className="absolute w-[45px] h-[45px] rounded-xl bg-[#e4572e]"
                    style={{ left: 31, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <div
                    className="absolute"
                    style={{ left: 96, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    <div className="text-[15px] font-semibold text-[#1e2436]">{d.name}</div>
                    <div className="text-[13px] text-gray-400 mt-0.5">{d.ip}</div>
                  </div>
                  <div
                    className="absolute text-[14px] font-medium text-gray-500"
                    style={{ left: 780, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    {d.usage}
                  </div>
                  <div
                    className={`absolute w-[64px] h-[36px] rounded-full ${
                      d.on ? 'bg-[#2a9d8f]' : 'bg-gray-200'
                    }`}
                    style={{ left: 881, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    <div
                      className="absolute top-[4px] w-[28px] h-[28px] rounded-full bg-white shadow"
                      style={{ left: d.on ? 32 : 4 }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <button className="mt-[14px] w-[181px] h-[47px] rounded-xl bg-[#1e2436] text-white font-bold text-[15px]">
          Restart router
        </button>
      </main>
    </div>
  )
}
