import ClockFace from './components/ClockFace'

export default function App() {
  return (
    <main className="h-[900px] w-full overflow-hidden bg-[#12302b] flow-root">
      <nav className="h-[90px] px-16 flex items-center justify-between border-b border-[#2f4a44]">
        <div className="flex items-center gap-10 text-sm tracking-[0.2em] text-[#efe6d3]">
          <span>WATCHES</span>
          <span>STRAPS</span>
        </div>
        <div className="font-serif font-bold text-3xl tracking-[0.25em] text-[#efe6d3]">
          Atelier Vos
        </div>
        <div className="flex items-center gap-10 text-sm tracking-[0.2em] text-[#efe6d3]">
          <span>REPAIRS</span>
          <span>VISIT</span>
        </div>
      </nav>

      <div className="relative" style={{ height: 711 }}>
        <div
          className="absolute rounded-full bg-[#efe6d3]"
          style={{ left: 150, top: 110, width: 479, height: 480 }}
        >
          <ClockFace className="absolute inset-0" />
        </div>

        <div
          className="absolute text-sm font-medium tracking-[0.3em] text-[#c9a24d]"
          style={{ left: 740, top: 171, width: 460 }}
        >
          SINCE 1952
        </div>

        <h1
          className="absolute font-serif italic leading-[1.05] text-7xl text-[#efe6d3]"
          style={{ left: 740, top: 212, width: 460 }}
        >
          Time, made by
          <br />
          hand
        </h1>

        <p
          className="absolute text-base leading-relaxed text-[#efe6d3]/70"
          style={{ left: 740, top: 400, width: 420 }}
        >
          Each movement is assembled and tuned in our Basel workshop.
        </p>

        <button
          className="absolute flex items-center justify-center rounded-full bg-transparent border-2 border-[#c9a24d] text-sm font-bold tracking-[0.2em] text-[#c9a24d]"
          style={{ left: 740, top: 489, width: 230, height: 58 }}
        >
          SEE THE COLLECTION
        </button>
      </div>
    </main>
  )
}
