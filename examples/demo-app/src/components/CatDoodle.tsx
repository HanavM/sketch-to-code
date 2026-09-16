const whiskers = [
  'M17.1,26 L2,22.5',
  'M17.1,30 L1,30',
  'M18.3,34 L3.5,38',
  'M46.9,26 L62,22.5',
  'M46.9,30 L63,30',
  'M45.7,34 L60.5,38',
]

export default function CatDoodle() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none text-gray-400"
      width="120"
      height="90"
      viewBox="0 0 64 48"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.4,17.4 L19,4 L29.4,13.2 A15,15 0 0 1 34.6,13.2 L45,4 L42.6,17.4 A15,15 0 1 1 21.4,17.4 Z" />
        <path d="M32,31.8 L32,33.5" />
        <path d="M32,33.5 C30.8,35.3 28.6,35 27.8,33.4" />
        <path d="M32,33.5 C33.2,35.3 35.4,35 36.2,33.4" />
        {whiskers.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <circle cx="26.5" cy="25" r="1.4" fill="currentColor" />
      <circle cx="37.5" cy="25" r="1.4" fill="currentColor" />
      <path d="M29.8,29.5 L34.2,29.5 L32,32 Z" fill="currentColor" />
    </svg>
  )
}
