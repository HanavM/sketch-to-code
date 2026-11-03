const produceItems = [
  { text: 'Bananas', checked: true },
  { text: 'Spinach', checked: true },
  { text: 'Lemons', checked: false },
  { text: 'Tomatoes', checked: false },
]

const dairyItems = [
  { text: 'Milk struck', checked: true },
  { text: 'Butter', checked: false },
  { text: 'Eggs', checked: false },
]

export default function App() {
  return (
    <main
      className="relative h-screen w-full overflow-hidden"
      style={{ backgroundColor: '#f7f6f1' }}
    >
      <h1
        className="absolute text-2xl font-bold text-[#264653]"
        style={{ left: 60, top: 23 }}
      >
        Basket
      </h1>

      <nav className="absolute text-base font-medium text-[#264653]" style={{ left: 1040, top: 22 }}>
        Lists
      </nav>
      <nav className="absolute text-base font-medium text-[#264653]" style={{ left: 1162, top: 22 }}>
        Recipes
      </nav>

      <h2
        className="absolute text-[40px] font-bold leading-none text-[#264653]"
        style={{ left: 60, top: 90 }}
      >
        Saturday shop
      </h2>

      <p
        className="absolute text-[32px] font-bold leading-none text-[#2a9d8f]"
        style={{ left: 1060, top: 94 }}
      >
        $46.20
      </p>

      {/* Produce card */}
      <section
        className="absolute"
        style={{ left: 59, top: 169, width: 562, height: 601, backgroundColor: '#ffffff', borderRadius: 0 }}
      >
        <div
          className="absolute flex items-center"
          style={{ left: 0, top: 0, width: 562, height: 58, backgroundColor: '#2a9d8f' }}
        >
          <span className="pl-[14px] text-base font-medium text-white whitespace-nowrap">Produce</span>
        </div>

        {produceItems.map((item, i) => (
          <div
            key={item.text}
            className="absolute flex items-center gap-[18px]"
            style={{ left: 25, top: 87 + i * 80, width: 500, height: 30 }}
          >
            <div
              className={`flex shrink-0 items-center justify-center ${item.checked ? '' : 'bg-white'}`}
              style={
                item.checked
                  ? { width: 30, height: 30, backgroundColor: '#2a9d8f' }
                  : { width: 30, height: 30, border: '1px solid #2a9d8f' }
              }
            >
              {item.checked && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span
              className={`whitespace-nowrap text-base ${item.checked ? 'text-gray-400 line-through' : 'text-[#264653]'}`}
            >
              {item.text}
            </span>
          </div>
        ))}
      </section>

      {/* Dairy card */}
      <section
        className="absolute"
        style={{ left: 649, top: 169, width: 562, height: 602, backgroundColor: '#ffffff', borderRadius: 0 }}
      >
        <div
          className="absolute flex items-center"
          style={{ left: 0, top: 0, width: 561, height: 58, backgroundColor: '#e9c46a' }}
        >
          <span className="pl-[14px] text-base font-medium text-[#264653] whitespace-nowrap">Dairy</span>
        </div>

        {dairyItems.map((item, i) => (
          <div
            key={item.text}
            className="absolute flex items-center gap-[18px]"
            style={{ left: 25, top: 87 + i * 80, width: 500, height: 30 }}
          >
            <div
              className={`flex shrink-0 items-center justify-center ${item.checked ? '' : 'bg-white'}`}
              style={
                item.checked
                  ? { width: 30, height: 30, backgroundColor: '#e9c46a' }
                  : { width: 30, height: 30, border: '1px solid #e9c46a' }
              }
            >
              {item.checked && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
</svg>
              )}
            </div>
            <span
              className={`whitespace-nowrap text-base ${item.checked ? 'text-gray-400 line-through' : 'text-[#264653]'}`}
            >
              {item.text}
            </span>
          </div>
        ))}
      </section>

      <input
        type="text"
        placeholder="Add an item"
        className="absolute bg-white pl-[14px] text-base text-[#264653] placeholder:text-[#264653]/60 outline-none"
        style={{ left: 60, top: 799, width: 1001, height: 58, border: '1px solid #c9c7bd' }}
      />

      <button
        type="button"
        className="absolute text-base font-medium text-white"
        style={{ left: 1080, top: 799, width: 130, height: 57, backgroundColor: '#264653' }}
      >
        Add
      </button>
    </main>
  )
}
