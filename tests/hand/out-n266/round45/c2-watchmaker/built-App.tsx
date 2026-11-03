import ClockWatch from './components/ClockWatch'

export default function App() {
  return (
    <main
      className="relative w-full h-[900px] overflow-hidden"
      style={{ backgroundColor: '#12302b' }}
    >
      <header className="absolute inset-x-0 top-0 h-[90px]">
        <a
          className="absolute text-[13px] font-medium tracking-[0.2em]"
          style={{ left: 276, top: 36, color: '#efe6d3' }}
        >
          WATCHES
        </a>
        <a
          className="absolute -translate-x-1/2 text-[13px] font-medium tracking-[0.2em]"
          style={{ left: 430, top: 36, color: '#efe6d3' }}
        >
          STRAPS
        </a>
        <div
          className="absolute -translate-x-1/2 font-serif font-bold text-3xl tracking-[0.15em]"
          style={{ left: 576, top: 22, color: '#efe6d3' }}
        >
          Atelier Vos
        </div>
        <a
          className="absolute -translate-x-1/2 text-[13px] font-medium tracking-[0.2em]"
          style={{ left: 800, top: 36, color: '#efe6d3' }}
        >
          REPAIRS
        </a>
        <a
          className="absolute -translate-x-1/2 text-[13px] font-medium tracking-[0.2em]"
          style={{ left: 945, top: 36, color: '#efe6d3' }}
        >
          VISIT
        </a>
      </header>

      <div className="absolute inset-x-0 top-[90px] h-px" style={{ backgroundColor: '#2f4a44' }} />

      <div
        className="absolute rounded-full"
        style={{
          left: 151,
          top: 200,
          width: 479,
          height: 480,
          backgroundColor: '#c9a24d',
          border: '6px solid #c9a24d',
        }}
      >
        <ClockWatch className="absolute inset-0 w-full h-full" />
      </div>

      <div className="absolute" style={{ left: 740, top: 261, width: 470 }}>
        <p
          className="absolute text-[13px] font-semibold tracking-[0.3em]"
          style={{ left: 0, top: 0, color: '#c9a24d' }}
        >
          SINCE 1952
        </p>
        <h1
          className="absolute font-serif italic"
          style={{ left: 0, top: 59, fontSize: 60, lineHeight: 1.1, color: '#efe6d3' }}
        >
          Time, made by
          <br />
          hand
        </h1>
        <p
          className="absolute text-base leading-relaxed"
          style={{ left: 0, top: 215, width: 440, color: '#b9c3bd' }}
        >
          Each movement is assembled and tuned in our Basel workshop.
        </p>
        <button
          className="absolute flex items-center justify-center rounded-lg text-[13px] font-bold tracking-[0.15em] uppercase"
          style={{
            left: 0,
            top: 318,
            width: 230,
            height: 58,
            backgroundColor: 'transparent',
            color: '#c9a24d',
            border: '1px solid #c9a24d',
          }}
        >
          SEE THE COLLECTION
        </button>
      </div>
    </main>
  )
}
