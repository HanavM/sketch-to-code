export default function App() {
  return (
    <main className="relative h-[900px] w-full overflow-hidden bg-white text-neutral-900">
      <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-[70px] py-7">
        <span className="text-lg font-extrabold tracking-[0.2em]">SWATCH</span>
        <div className="flex items-center gap-8 text-sm font-medium">
          <a href="#">Colours</a>
          <a href="#">Samples</a>
          <a href="#">Stores</a>
        </div>
      </nav>

      <h1 className="absolute left-[70px] top-[157px] w-[480px] text-[60px] font-bold leading-[1.1]">
        Find the colour
        <br />
        of your room
      </h1>

      <p className="absolute left-[70px] top-[351px] max-w-[460px] text-lg text-neutral-700">
        Order five free sample cards. Paint arrives in two days.
      </p>

      <button className="absolute left-[70px] top-[449px] flex h-[59px] w-[220px] items-center justify-center rounded-lg bg-[#222222] text-base font-semibold text-white">
        Get samples
      </button>

      <h2 className="absolute left-[70px] top-[595px] text-2xl font-bold">THIS SEASON</h2>

      <div className="absolute left-[70px] top-[640px] flex items-center gap-3">
        {[
          { name: 'dark teal', color: '#27444f' },
          { name: 'teal', color: '#2ba08f' },
          { name: 'mustard', color: '#e8c46b' },
          { name: 'orange', color: '#f4a460' },
          { name: 'clay', color: '#e87050' },
          { name: 'slate', color: '#909ab0' },
        ].map((swatch) => (
          <span
            key={swatch.name}
            className="h-10 w-10 rounded-full"
            style={{ backgroundColor: swatch.color }}
          />
        ))}
      </div>

      {/* swatch gallery */}
      <div
        className="absolute left-[640px] top-[217.5px] h-[381px] w-[224px] rounded-lg bg-white shadow-lg"
        style={{ transform: 'rotate(-12deg)' }}
      />
      <div
        className="absolute left-[644.5px] top-[234.5px] h-[271px] w-[195px] rounded-sm bg-[#2b6f99]"
        style={{ transform: 'rotate(-11.5deg)' }}
      />

      <div className="absolute left-[799px] top-[189px] h-[382px] w-[222px] rounded-lg bg-white shadow-lg" />
      <div className="absolute left-[814px] top-[203px] h-[271px] w-[187px] rounded-sm bg-[#e8c46b]" />

      <div
        className="absolute left-[959px] top-[218px] h-[382px] w-[224px] rounded-lg bg-white shadow-lg"
        style={{ transform: 'rotate(12deg)' }}
      />
      <div
        className="absolute left-[982px] top-[234.5px] h-[271px] w-[194px] rounded-sm bg-[#e87050]"
        style={{ transform: 'rotate(12deg)' }}
      />

      <div
        className="absolute left-[619px] top-[545px] text-sm"
        style={{ transform: 'rotate(-12deg)' }}
      >
        <p className="font-semibold">Harbour</p>
        <p className="mt-1 text-neutral-600">No. 214</p>
      </div>
      <div className="absolute left-[814px] top-[497px] text-sm">
        <p className="font-semibold">Mustard</p>
        <p className="text-neutral-600">No. 087</p>
      </div>
      <div
        className="absolute left-[956px] top-[545px] text-sm"
        style={{ transform: 'rotate(12deg)' }}
      >
        <p className="font-semibold">Clay</p>
        <p className="text-neutral-600">No. 131</p>
      </div>
    </main>
  )
}
