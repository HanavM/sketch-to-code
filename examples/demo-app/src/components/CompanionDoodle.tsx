const legs = [
  'M9,29 C8.5,33.5 7,37.5 4,40',
  'M17,29 C16.5,33.5 15,37.5 12,40',
  'M25,29 C24.5,33.5 23,37.5 20,40',
]

export default function CompanionDoodle() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute bottom-4 left-24 z-10 text-gray-400"
      width="68"
      height="46"
      viewBox="-2 -2 72 50"
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="51" cy="22" rx="16.5" ry="21.5" />
        <path d="M46,29.8 C48.2,32.6 50.6,27.8 52.8,30.4 C54,31.8 55.4,31.8 56.6,30.4" />
        <path d="M34.5,29 L9,29" />
        {legs.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d="M34.8,23.5 C32.5,22.4 30.2,21.6 28.4,21.6" />
        <path d="M28.4,21.6 C24.6,17.8 23.4,25.8 27.6,24.6" />
      </g>
      <circle cx="46.5" cy="19" r="1.4" fill="currentColor" />
      <circle cx="56" cy="19" r="1.4" fill="currentColor" />
    </svg>
  )
}
