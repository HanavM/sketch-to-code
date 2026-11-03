const ROWS: {
  name: string
  pct: string
  labelY: number
  stripY: number
  marks: { x: number; w: number }[]
}[] = [
  { name: 'API', pct: '100.00%', labelY: 198, stripY: 239, marks: [] },
  {
    name: 'Dashboard',
    pct: '99.89%',
    labelY: 272,
    stripY: 313,
    marks: [{ x: 668, w: 29 }],
  },
  {
    name: 'Webhooks',
    pct: '99.67%',
    labelY: 346,
    stripY: 387,
    marks: [
      { x: 468, w: 29 },
      { x: 640, w: 46 },
    ],
  },
  { name: 'Database', pct: '100.00%', labelY: 420, stripY: 461, marks: [] },
  {
    name: 'Email',
    pct: '99.89%',
    labelY: 494,
    stripY: 535,
    marks: [{ x: 418, w: 29 }],
  },
  {
    name: 'Search',
    pct: '99.78%',
    labelY: 568,
    stripY: 609,
    marks: [
      { x: 262, w: 29 },
      { x: 330, w: 30 },
    ],
  },
]

const INCIDENTS = [
  { date: 'Oct 28', text: 'Webhooks delayed for 40 minutes' },
  { date: 'Oct 19', text: 'Dashboard slow to load' },
  { date: 'Oct 6', text: 'Search returned old results' },
]

const CARD_TOP = 189
const CARD_LEFT = 99

export default function App() {
  return (
    <main
      style={{
        position: 'relative',
        width: '100%',
        minWidth: 1280,
        height: 900,
        background: '#f7f8fa',
        overflow: 'hidden',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div style={{ position: 'absolute', left: 100, top: 24, fontSize: 26, fontWeight: 700, color: '#111827' }}>
        Tern
      </div>

      <button
        style={{
          position: 'absolute',
          left: 1050,
          top: 26,
          width: 130,
          height: 41,
          background: 'transparent',
          color: '#222222',
          border: '1.5px solid #222222',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Subscribe
      </button>

      <div
        style={{
          position: 'absolute',
          left: 99,
          top: 89,
          width: 1080,
          height: 74,
          background: '#31a56d',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            marginLeft: 14,
            color: '#ffffff',
            fontSize: 20,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          All systems working
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: CARD_LEFT,
          top: CARD_TOP,
          width: 1082,
          height: 472,
          background: '#ffffff',
        }}
      >
        {ROWS.map((row) => (
          <div key={row.name}>
            <div
              style={{
                position: 'absolute',
                left: 25,
                top: row.labelY - CARD_TOP,
                width: 1026,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 15,
                fontWeight: 600,
                color: '#111827',
              }}
            >
              <span>{row.name}</span>
              <span>{row.pct}</span>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 25,
                top: row.stripY - CARD_TOP,
                width: 1026,
                height: 28,
                background: '#31a56d',
              }}
            >
              {row.marks.map((mark) => (
                <span
                  key={mark.x}
                  style={{
                    position: 'absolute',
                    left: mark.x - 124,
                    top: 0,
                    width: mark.w,
                    height: 28,
                    lineHeight: '28px',
                    color: '#e84a4f',
                    fontWeight: 700,
                    letterSpacing: 3,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ▮▮▮▮▮▮
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', left: 100, top: 676, fontSize: 18, fontWeight: 700, color: '#111827' }}>
        Past incidents
      </div>

      {INCIDENTS.map((inc, i) => (
        <div
          key={inc.date}
          style={{
            position: 'absolute',
            left: 100,
            top: 718 + i * 50,
            display: 'flex',
            fontSize: 14,
            color: '#111827',
          }}
        >
          <span style={{ width: 100, color: '#6b7280' }}>{inc.date}</span>
          <span>{inc.text}</span>
        </div>
      ))}
    </main>
  )
}
