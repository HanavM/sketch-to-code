export default function App() {
  return (
    <main className="relative h-[900px] w-full overflow-hidden bg-[#eef6fc]">
      {/* Top bar */}
      <div className="absolute left-[60px] top-[45px] text-[28px] font-bold text-[#1f6fb2]">
        Sip
      </div>
      <div className="absolute left-[1100px] top-[45px] text-[16px] text-slate-500">
        Tuesday
      </div>

      {/* Today's water */}
      <div className="absolute left-[140px] top-[117px] text-[30px] font-bold text-slate-900">
        Today's water
      </div>

      {/* Water level container */}
      <div className="absolute left-[139px] top-[169px] h-[562px] w-[322px] box-border border-[6px] border-[#1f6fb2] bg-white">
        <div className="absolute inset-x-0 bottom-0 top-[250px] bg-[#6bbfef]" />
      </div>

      {/* Stat line */}
      <div className="absolute left-[620px] top-[152px] text-[76px] font-bold leading-none text-[#1f6fb2]">
        1.2 L
      </div>
      <div className="absolute left-[880px] top-[172px] text-[16px] text-slate-600">
        of 2 L goal
      </div>

      <span className="absolute left-[619px] top-[237px] inline-block rounded-md bg-[#5a6b7a] px-3 py-1 text-[13px] font-bold text-white">Add a drink</span>
      <div className="absolute left-[619px] top-[269px] box-border flex h-[70px] w-[481px] flex-col items-start justify-center rounded-lg border border-slate-200 bg-white px-6">
        <span className="text-[16px] font-semibold text-slate-800">Glass, 250 ml</span>
      </div>
      <div className="absolute left-[620px] top-[355px] box-border flex h-[70px] w-[480px] items-center rounded-lg border border-slate-200 bg-white px-6">
        <span className="text-[16px] font-semibold text-slate-800">Bottle, 500 ml</span>
      </div>
      <div className="absolute left-[620px] top-[441px] box-border flex h-[70px] w-[481px] items-center rounded-lg border border-slate-200 bg-white px-6">
        <span className="text-[16px] font-semibold text-slate-800">Mug, 300 ml</span>
      </div>

      {/* This week */}
      <div className="absolute left-[620px] top-[572px] text-[20px] font-bold text-slate-900">
        This week
      </div>

      {/* Bar chart */}
      <div className="absolute left-[620px] top-[630px] h-[132px] w-[495px]">
        <div className="absolute left-0 top-[19px] h-[91px] w-[44px] rounded-t-sm bg-[#1f6fb2]" />
        <div className="absolute left-[77px] top-0 h-[110px] w-[45px] rounded-t-sm bg-[#1f6fb2]" />
        <div className="absolute left-[156px] top-[50px] h-[60px] w-[45px] rounded-t-sm bg-[#1f6fb2]" />
        <div className="absolute left-[233px] top-[30px] h-[80px] w-[45px] rounded-t-sm bg-[#1f6fb2]" />

        {/* Day labels */}
        <div className="absolute left-[12px] top-[123px] flex w-[483px] justify-between text-[13px] text-[#5a6b7a]">
          <span>M</span>
          <span>T</span>
          <span>W</span>
          <span>T</span>
          <span>F</span>
          <span>S</span>
          <span>S</span>
        </div>
      </div>
    </main>
  )
}
