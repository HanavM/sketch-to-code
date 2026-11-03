import ArchedGreenhouse from './components/ArchedGreenhouse'

export default function App() {
  return (
    <main
      className="relative w-[1280px] h-[900px] overflow-hidden flow-root"
      style={{ background: '#f4f1e8' }}
    >
      {/* header */}
      <header className="absolute left-0 right-0 top-[22px] flex items-center justify-between px-[70px]">
        <span className="font-serif font-bold text-2xl" style={{ color: '#1f3a2b' }}>
          Glasshouse
        </span>
        <nav className="flex items-center gap-10 font-serif font-bold" style={{ color: '#1f3a2b' }}>
          <a href="#">Plants</a>
          <a href="#">Visit</a>
          <a href="#">Shop</a>
        </nav>
      </header>

      {/* hero headline + body copy */}
      <h1
        className="absolute font-serif"
        style={{
          left: 70,
          top: 201,
          fontSize: 64,
          lineHeight: '70px',
          fontWeight: 400,
          color: '#1f3a2b',
        }}
      >
        Tropics in the
        <br />
        middle of town
      </h1>
      <p
        className="absolute"
        style={{ left: 70, top: 395, width: 420, fontSize: 18, lineHeight: '28px', color: '#4b5563' }}
      >
        Walk through two hundred kinds of fern, palm and orchid.
      </p>

      {/* CTA buttons */}
      <button
        className="absolute rounded-lg font-bold flex items-center justify-center"
        style={{
          left: 70,
          top: 489,
          width: 191,
          height: 57,
          background: '#2f6b47',
          color: '#ffffff',
        }}
      >
        Plan a visit
      </button>
      <button
        className="absolute font-bold flex items-center justify-center"
        style={{
          left: 279,
          top: 489,
          width: 191,
          height: 57,
          background: '#ffffff',
          color: '#1f3a2b',
          border: '2px solid #2f6b47',
        }}
      >
        See the plants
      </button>

      {/* arched greenhouse illustration */}
      <div className="absolute" style={{ left: 609, top: 146, width: 581, height: 635 }}>
        <div
          className="absolute"
          style={{
            left: 36,
            top: 0,
            width: 511,
            height: 589,
            clipPath:
              'polygon(0px 589px, 0px 254px, 7px 197px, 22px 148px, 56px 95px, 95px 54px, 144px 23px, 198px 4px, 221px 2px, 255px 0px, 312px 5px, 366px 24px, 414px 55px, 454px 95px, 486px 143px, 503px 197px, 511px 290px, 509px 588px)',
            background: '#dde9d8',
          }}
        />
        <ArchedGreenhouse className="absolute left-0 top-0" />
        {/* thick frame mullions, exact drawn boxes filled solid #2f6b47 */}
        <div className="absolute" style={{ left: 163, top: 37, width: 2, height: 550, background: '#2f6b47' }} />
        <div className="absolute" style={{ left: 293, top: 0, width: 2, height: 587, background: '#2f6b47' }} />
        <div className="absolute" style={{ left: 423, top: 37, width: 2, height: 550, background: '#2f6b47' }} />
        <div className="absolute" style={{ left: 41, top: 206, width: 500, height: 2, background: '#2f6b47' }} />
        <div className="absolute" style={{ left: 41, top: 406, width: 500, height: 2, background: '#2f6b47' }} />
      </div>
    </main>
  )
}
