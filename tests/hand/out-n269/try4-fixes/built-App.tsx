import Rocket from './components/Rocket'

export default function App() {
  return (
    <main className="relative h-[900px] w-full overflow-hidden bg-[#0b1f47]">
      <div className="pointer-events-none absolute inset-0 h-full w-full bg-[#0b1f47]" />
      {/* stars */}
      <span className="absolute left-[704px] top-[144px] h-[6px] w-[6px] rounded-full bg-white" />
      <span className="absolute left-[764px] top-[424px] h-[6px] w-[6px] rounded-full bg-white" />
      <span className="absolute left-[694px] top-[644px] h-[6px] w-[6px] rounded-full bg-white" />
      <span className="absolute left-[1064px] top-[124px] h-[6px] w-[6px] rounded-full bg-white" />
      <span className="absolute left-[1124px] top-[184px] h-[6px] w-[6px] rounded-full bg-white" />
      <span className="absolute left-[1154px] top-[474px] h-[6px] w-[6px] rounded-full bg-white" />

      {/* navbar */}
      <span className="absolute left-16 top-[26px] text-xl font-bold text-white">Liftoff Camp</span>
      <a href="#" className="absolute left-[1016px] top-[28px] font-medium text-white">Missions</a>
      <a href="#" className="absolute left-[1108px] top-[28px] font-medium text-white">Crew</a>
      <a href="#" className="absolute left-[1176px] top-[28px] font-medium text-white">Apply</a>

      {/* headline + subcopy */}
      <h1 className="absolute left-16 top-[180px] text-7xl font-bold leading-[1.1] text-white">
        Build a rocket<br />this summer
      </h1>
      <p className="absolute left-16 top-[362px] max-w-md text-lg text-blue-100">
        Two weeks of science, engines and one big launch day.
      </p>

      {/* CTA */}
      <button className="absolute left-[65px] top-[469px] h-[61px] w-[229px] rounded-full bg-[#ff7a1a] text-lg font-bold text-white">
        Join the crew
      </button>

      {/* rocket illustration */}
      <div className="absolute left-[859px] top-[110px] h-[650px] w-[122px]">
        <Rocket className="absolute inset-0" />
        <div
          className="absolute left-0 top-0 h-[130px] w-[121px] bg-[#f24545]"
          style={{ clipPath: 'polygon(60px 0px, 121px 130px, 0px 130px)' }}
        />
        <div className="absolute left-[32px] top-[190px] h-[60px] w-[58px] rounded-full bg-[#38bdf8]" />
      </div>

      {/* bottom bar */}
      <div className="absolute inset-x-0 bottom-0 h-[99px] bg-[#13285e]" />
    </main>
  )
}
