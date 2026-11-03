const STRIPE_LIGHT = '#a0122f'
const STRIPE_DARK = '#780e23'

function StripeColumn({ left, width, label }: { left: number; width: number; label: string }) {
  return (
    <div
      className="absolute top-[89px] h-[631px]"
      style={{ left, width, zIndex: 0, background: STRIPE_LIGHT }}
    >
      <div className="absolute inset-0 flex pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-full"
            style={{ background: i % 2 === 0 ? STRIPE_LIGHT : STRIPE_DARK }}
          />
        ))}
      </div>
      <span
        className="absolute text-white/80 text-sm px-2"
        style={{ top: 211 }}
      >
        {label}
      </span>
    </div>
  )
}

export default function App() {
  return (
    <main
      className="relative w-[1280px] h-[900px] overflow-hidden"
      style={{ background: '#1a1024' }}
    >
      {/* header */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: 2, top: 1, width: 1276, height: 90, background: '#d9a441', zIndex: 50 }}
      >
        <h1
          className="font-serif font-bold uppercase"
          style={{ color: '#1a1024', letterSpacing: '0.3em', fontSize: 32 }}
        >
          The Strings
        </h1>
      </div>

      {/* left / right stripe columns */}
      <StripeColumn left={1} width={352} label="x8 vertical stripes, alternate darker" />
      <StripeColumn left={927} width={351} label="x8 vertical stripes, alternate darker" />

      {/* spotlight stage */}
      <div
        className="absolute left-[390px] top-[90px] w-[500px] h-[630px]"
        style={{
          clipPath: 'polygon(200px 0px, 300px 0px, 500px 630px, 0px 630px)',
          background: '#4f4040',
          zIndex: 10,
        }}
      />

      {/* heading */}
      <div
        className="absolute font-serif font-bold whitespace-nowrap"
        style={{ left: 395, top: 139, color: '#ffe6c7', fontSize: 58, lineHeight: 1, zIndex: 20 }}
      >
        Small stage, huge
      </div>
      <div
        className="absolute font-serif font-bold whitespace-nowrap"
        style={{ left: 547, top: 207, color: '#ffe6c7', fontSize: 58, lineHeight: 1, zIndex: 20 }}
      >
        drama
      </div>
      <div
        className="absolute"
        style={{ left: 547, top: 253, width: 186, height: 8, background: '#ffe6c7', zIndex: 19 }}
      />

      {/* tagline */}
      <p
        className="absolute"
        style={{ left: 440, top: 392, width: 420, color: '#e8e2da', fontSize: 18, lineHeight: 1.5, zIndex: 20 }}
      >
        Marionette plays for grown-ups, five nights a week.
      </p>

      {/* marionette puppet icon */}
      <div
        className="absolute"
        style={{
          left: 575,
          top: 560,
          width: 130,
          height: 160,
          clipPath: 'polygon(32px 0px, 98px 0px, 130px 160px, 0px 160px)',
          background: '#2e86ab',
          zIndex: 30,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ left: 601, top: 480, width: 78, height: 80, background: '#f2c9a0', zIndex: 31 }}
      />

      {/* CTA button */}
      <button
        className="absolute rounded-full font-bold"
        style={{
          left: 519,
          top: 755,
          width: 241,
          height: 58,
          background: '#d9a441',
          color: '#1a1024',
          fontSize: 18,
          zIndex: 40,
        }}
      >
        Get seats
      </button>

      {/* footer */}
      <div
        className="absolute"
        style={{ left: 2, top: 719, width: 1276, height: 179, background: '#5a3a23', zIndex: 5 }}
      >
        <span
          className="absolute"
          style={{ left: 62, top: 100, color: '#f2ece2', fontSize: 20 }}
        >
          Thu to Mon, 8 pm
        </span>
        <span
          className="absolute"
          style={{ left: 1038, top: 100, color: '#f2ece2', fontSize: 20 }}
        >
          Doors at 7:30
        </span>
      </div>
    </main>
  )
}
