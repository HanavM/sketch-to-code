const side = [
  'M19.5,24 C15,22.5 11,19.5 8.5,15.5',
  'M8.5,15.5 C2.5,13.5 1,6.5 6,4 C10.5,1.8 13.5,6 11.5,9.5 C10.5,11.5 9.5,13.5 8.5,15.5 Z',
  'M11.5,9.5 C9.5,10 7.5,10.2 5.5,9.5',
  'M24,34 C22,37 19.5,39.5 16.5,41',
  'M29,35 C28,38 26.5,40.5 24.5,42',
]

export default function CrabDoodle() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute bottom-4 left-4 z-10 text-gray-400"
      width="65"
      height="45"
      viewBox="-2 -2 69 49"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="32.5" cy="26" rx="13" ry="8.5" />
        <path d="M28.5,29.5 C30.5,31.5 34.5,31.5 36.5,29.5" />
        {side.map((d) => (
          <path key={d} d={d} />
        ))}
        <g transform="translate(65, 0) scale(-1, 1)">
          {side.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>
      <circle cx="28.5" cy="23" r="1.4" fill="currentColor" />
      <circle cx="36.5" cy="23" r="1.4" fill="currentColor" />
    </svg>
  )
}
