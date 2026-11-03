const staff = [
  { name: "Maya", role: "Barista", shift: "8 to 2", left: 240, width: 421, color: "#2a9d8f", rowHeight: 90 },
  { name: "Tom", role: "Barista", shift: "10 to 4", left: 519, width: 421, color: "#f28c00", rowHeight: 90 },
  { name: "Ines", role: "Kitchen", shift: "10 to 6", left: 380, width: 561, color: "#3a86ff", rowHeight: 90 },
  { name: "Sam", role: "Kitchen", shift: "4 to 10", left: 800, width: 420, color: "#8338ec", rowHeight: 90 },
  { name: "Ravi", role: "Floor", shift: "2 to 10", left: 660, width: 561, color: "#2a9d8f", rowHeight: 90 },
  { name: "Jo", role: "Floor", shift: "8 to 12", left: 240, width: 281, color: "#f28c00", rowHeight: 119 },
]

const timeLabels = ["8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"]

export default function App() {
  return (
    <main className="relative w-[1280px] h-[900px] bg-white overflow-hidden flow-root box-border">
      <div className="relative h-[190px] border-b border-[#dfe5ea] box-border">
        <div className="absolute inset-x-0 top-0 h-[76px] bg-[#2b2e45] flex items-center justify-between px-10 box-border">
          <span className="text-white font-bold text-xl">Rota</span>
          <nav className="flex items-center gap-8">
            <a href="#" className="text-white/90 font-medium">Week</a>
            <a href="#" className="text-white/90 font-medium">People</a>
            <a href="#" className="text-white/90 font-medium">Swaps</a>
          </nav>
        </div>

        <h1
          className="absolute left-10 font-bold whitespace-nowrap text-[#1d2533]"
          style={{ top: "102px", fontSize: "30px", lineHeight: "36px" }}
        >
          Thursday shifts
        </h1>

        <button
          className="absolute rounded-lg bg-[#f2243e] text-white font-bold flex items-center justify-center"
          style={{ left: "1040px", top: "99px", width: "200px", height: "47px" }}
        >
          Publish
        </button>
      </div>

      <div
        className="absolute flex items-center justify-between text-gray-500 font-bold text-sm"
        style={{ left: "240px", top: "190px", width: "1000px", transform: "translateY(-50%)" }}
      >
        {timeLabels.map((label) => (
          <span key={label} className="whitespace-nowrap">{label}</span>
        ))}
      </div>

      <div className="flex flex-col" style={{ height: "569px" }}>
        {staff.map((row) => (
          <div
            key={row.name}
            className="relative border-b border-[#dfe5ea] flex items-center box-border"
            style={{ height: `${row.rowHeight}px` }}
          >
            <div className="absolute left-10">
              <div className="font-semibold text-[#1d2533] leading-tight">{row.name}</div>
              <div className="text-sm text-gray-400 leading-tight">{row.role}</div>
            </div>
            <div
              className="absolute rounded-md flex items-center text-white font-semibold text-sm"
              style={{
                left: `${row.left}px`,
                width: `${row.width}px`,
                height: "52px",
                top: "50%",
                transform: "translateY(-50%)",
                backgroundColor: row.color,
              }}
            >
              <span className="pl-3.5">{row.shift}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative h-[119px] bg-[#ecf1f4] box-border">
        <p className="absolute text-[#1d2533] font-semibold" style={{ left: "200px", top: "61px" }}>
          6 people, 42 hours, Cost $780
        </p>
      </div>
    </main>
  )
}
