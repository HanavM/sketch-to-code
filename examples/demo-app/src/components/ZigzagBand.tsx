const zigzag =
  'M2,18 L76,34 L150,2 L224,34 L298,2 L372,34 L446,2 L520,34 L594,2 L668,34 L742,2 L816,34 L890,2'

export default function ZigzagBand() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-[1.6%] top-1/2 -z-10 h-9 -translate-y-1/2 text-blue-500/25"
      viewBox="0 0 896 36"
      preserveAspectRatio="none"
      fill="none"
    >
      <path d={zigzag} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
