import MapLocation from './components/MapLocation'

export default function App() {
  return (
    <main
      className="relative w-[1280px] h-[900px] overflow-hidden flow-root"
      style={{ background: '#f3f4f8' }}
    >
      {/* top navy header */}
      <header className="absolute left-[2px] top-[1px] w-[1276px] h-[76px] bg-[#1a2238] flex items-center justify-between px-10 box-border">
        <h1 className="text-white font-bold text-2xl">Next Bus</h1>
        <span className="text-white/70 text-sm">Stop 4417, Market St</span>
      </header>

      {/* row 1: bus-arrival card (route 14 to Harbour, 2 min) */}
      <div className="absolute left-[39px] top-[103px] w-[701px] h-[106px] bg-white rounded-2xl box-border">
        <div className="absolute left-[23px] top-[24px] w-[81px] h-[58px] bg-[#dc2640] rounded-xl flex items-center justify-center">
          <span className="text-white font-bold text-xl">14</span>
        </div>
        <span className="absolute left-[125px] top-[29px] text-gray-900 font-semibold text-base">Harbour</span>
        <span className="absolute left-[551px] top-[27px] text-gray-500 text-sm">2 min</span>
      </div>

      {/* row 2: route 7 to University, 5 min */}
      <div className="absolute left-[39px] top-[222px] w-[701px] h-[105px] bg-white rounded-2xl box-border" />
      <div className="absolute left-[62px] top-[246px] w-[80px] h-[57px] bg-[#1d9e8c] rounded-xl flex items-center justify-center">
        <span className="text-white font-bold text-xl">7</span>
        <span className="absolute left-[102px] top-[19px] text-gray-900 font-semibold text-base whitespace-nowrap">University</span>
      </div>
      <span className="absolute left-[551px] top-[249px] text-gray-500 text-sm">5 min</span>

      {/* row 3: route 22 to Airport, 9 min */}
      <div className="absolute left-[39px] top-[339px] w-[701px] h-[105px] bg-white rounded-2xl box-border" />
      <div className="absolute left-[61px] top-[363px] w-[80px] h-[57px] bg-[#2f86ab] rounded-xl flex items-center justify-center">
        <span className="text-white font-bold text-xl">22</span>
        <span className="absolute left-[102px] top-[19px] text-gray-900 font-semibold text-base whitespace-nowrap">Airport</span>
      </div>
      <span className="absolute left-[551px] top-[366px] text-gray-500 text-sm">9 min</span>

      {/* row 4: route 14 to Harbour, 14 min */}
      <div className="absolute left-[39px] top-[457px] w-[701px] h-[105px] bg-white rounded-2xl box-border" />
      <div className="absolute left-[62px] top-[481px] w-[80px] h-[57px] bg-[#dc2640] rounded-xl flex items-center justify-center">
        <span className="text-white font-bold text-xl">14</span>
        <span className="absolute left-[102px] top-[19px] text-gray-900 font-semibold text-base whitespace-nowrap">Harbour</span>
      </div>
      <span className="absolute left-[551px] top-[484px] text-gray-500 text-sm">14 min</span>

      {/* row 5: route N3 to Old Town, 18 min */}
      <div className="absolute left-[39px] top-[576px] w-[701px] h-[105px] bg-white rounded-2xl box-border" />
      <div className="absolute left-[61px] top-[600px] w-[81px] h-[57px] bg-[#40338c] rounded-xl flex items-center justify-center">
        <span className="text-white font-bold text-xl">N3</span>
        <span className="absolute left-[102px] top-[19px] text-gray-900 font-semibold text-base whitespace-nowrap">Old Town</span>
      </div>
      <span className="absolute left-[551px] top-[603px] text-gray-500 text-sm">18 min</span>

      {/* detour alert banner */}
      <div className="absolute left-[39px] top-[703px] w-[701px] h-[102px] bg-[#fff1cc] rounded-2xl box-border flex items-center px-6">
        <span className="text-amber-900 font-medium text-base">Route 22 detour on 5th Ave until Friday</span>
      </div>

      {/* map panel */}
      <div className="absolute left-[779px] top-[103px] w-[462px] h-[702px] bg-[#dfe6dc] overflow-hidden box-border">
        <MapLocation className="absolute inset-0" />
        <div
          className="absolute w-8 h-8 rounded-full bg-[#dc2640] box-border border-[3px] border-white"
          style={{ left: 217, top: 268 }}
        />
      </div>

      {/* secondary info panel beneath map */}
      <div className="absolute left-[779px] top-[689px] w-[461px] h-[116px] bg-[#a6d3ea] rounded-2xl box-border px-6 py-4">
        <h3 className="text-[#1a2238] font-semibold text-sm">Route legend</h3>
        <p className="text-[#1a2238]/70 text-xs mt-1">Live positions update every 30 seconds.</p>
      </div>
    </main>
  )
}
