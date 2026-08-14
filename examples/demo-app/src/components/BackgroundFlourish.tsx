const curve = 'M14 0 C24 130, 42 270, 58 390 C70 480, 78 540, 62 578 C48 610, 20 606, 0 598'

export default function BackgroundFlourish() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 flex justify-between text-blue-500/25">
      <svg width="80" height="600" viewBox="0 0 80 600" fill="none">
        <path d={curve} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <svg width="80" height="600" viewBox="0 0 80 600" fill="none">
        <g transform="translate(80, 0) scale(-1, 1)">
          <path d={curve} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}
