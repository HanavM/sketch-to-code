/**
  * Sketched form — scaffolded from the drawing by sketch2code.
  *
  * The paths below are the user's own strokes, fitted. They are the SPEC:
  * keep them. Build the finished thing AROUND them — fills, interior
  * detail, shading — rather than replacing them with your own shapes.
  */
export default function SketchShape({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 112 10"
      width={112}
      height={10}
      className={`pointer-events-none ${className}`}
    >
      <style>{`@keyframes s2cDraw{to{stroke-dashoffset:0}}
@keyframes s2cFade{from{opacity:0}to{opacity:1}}
.s2c-etch [stroke]{stroke-dasharray:2000;stroke-dashoffset:2000;animation:s2cDraw .7s ease-out forwards}
.s2c-etch [fill]:not([fill="none"]){animation:s2cFade .5s .25s ease-out backwards}
.s2c-etch *{transition:fill .5s ease,stroke .5s ease,fill-opacity .5s ease,stroke-opacity .5s ease,opacity .5s ease}
@media (prefers-reduced-motion:reduce){.s2c-etch [stroke],.s2c-etch [fill]{animation:none;stroke-dashoffset:0}
.s2c-etch *{transition:none}}`}</style>
      <defs>
        <linearGradient id="sketchshape-form" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      {/* s0: drawn by the user — measured geometry, keep it */}
      <path d="M0,0 C4.7,3.3 8.3,10 14,10 C19.7,10 22.3,0 28,0 C33.7,0 36.3,10 42,10 C47.7,10 50.3,0 56,0 C61.7,0 64.3,10 70,10 C75.7,10 78.3,0 84,0 C89.7,0 92.3,10 98,10 C103.7,10 107.3,3.3 112,0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
