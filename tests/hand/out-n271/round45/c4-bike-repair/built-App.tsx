import BicycleWheels from './components/BicycleWheels'

export default function App() {
  return (
    <main className="relative bg-white" style={{ width: 1280, height: 900, overflow: 'hidden' }}>
      {/* Top bar */}
      <div
        className="absolute flex items-center justify-between bg-white"
        style={{ left: 4, top: 5, width: 1272, height: 68, paddingLeft: 66, paddingRight: 67 }}
      >
        <span className="text-lg font-bold text-gray-900" style={{ fontWeight: 700 }}>Spoke &amp; Chain</span>
        <div className="flex items-center gap-10 text-sm font-medium text-gray-900">
          <a href="#services" style={{ order: 1 }}>Services</a>
          <a href="#prices" style={{ order: 2 }}>Prices</a>
          <a href="#book" style={{ order: 3 }}>Book</a>
        </div>
      </div>

      {/* Hero */}
      <section
        className="absolute"
        style={{ left: 1, top: 79, width: 1277, height: 482, background: '#ffd23f', borderRadius: 0 }}
      />

      <h1
        className="absolute font-extrabold text-gray-900"
        style={{ left: 70, top: 150, width: 600, fontSize: 72, lineHeight: 1 }}
      >
        Your bike, fixed
        <br />
        by Friday
      </h1>

      <p
        className="absolute text-gray-800"
        style={{ left: 70, top: 334, width: 480, fontSize: 18 }}
      >
        Drop it off Monday. Ride it home this week.
      </p>

      <a
        href="#book"
        className="absolute flex items-center justify-center rounded-lg font-semibold"
        style={{ left: 70, top: 419, width: 221, height: 60, background: '#111111', color: '#ffd23f' }}
      >
        Book a repair
      </a>

      <BicycleWheels className="absolute text-gray-900" style={{ left: 694, top: 205 }} />

      {/* Service cards */}
      <div
        className="absolute rounded-lg bg-white flex flex-col justify-center"
        style={{ left: 70, top: 619, width: 361, height: 222, border: '2px solid #111111', padding: 24 }}
      >
        <span className="text-sm font-bold text-gray-500 mb-2">Tune-up</span>
        <p className="text-sm text-gray-600">Gears, brakes and a full check.</p>
        <span className="font-bold text-gray-900 whitespace-nowrap" style={{ fontSize: 28 }}>$65</span>
      </div>

      <div
        className="absolute rounded-lg bg-white flex flex-col justify-center"
        style={{ left: 459, top: 619, width: 361, height: 221, border: '2px solid #111111', padding: 24 }}
      >
        <span className="text-sm font-bold text-gray-500 mb-2">Flat fix</span>
        <p className="text-sm text-gray-600">New tube, done while you wait.</p>
        <span className="font-bold text-gray-900 whitespace-nowrap" style={{ fontSize: 28 }}>$20</span>
      </div>

      <div
        className="absolute rounded-lg bg-white flex flex-col justify-center"
        style={{ left: 849, top: 619, width: 361, height: 222, border: '2px solid #111111', padding: 24 }}
      >
        <span className="text-sm font-bold text-gray-500 mb-2">Full service</span>
        <p className="text-sm text-gray-600">Strip, clean and rebuild.</p>
        <span className="font-bold text-gray-900 whitespace-nowrap" style={{ fontSize: 28 }}>$180</span>
      </div>
    </main>
  )
}
