const cars = [
  { name: 'Fiat 500', seats: '4 seats', gearbox: 'Automatic', price: '$38' },
  { name: 'VW Golf', seats: '5 seats', gearbox: 'Manual', price: '$45' },
  { name: 'Toyota RAV4', seats: '5 seats', gearbox: 'Automatic', price: '$72' },
]

export default function App() {
  return (
    <div className="h-[900px] w-full overflow-hidden bg-gray-100">
      <div className="h-[69px] flex items-center px-8 border-b border-[#dfe3e8] bg-white">
        <span className="text-lg font-bold text-teal-700">Roadly</span>
      </div>

      <div className="relative mx-10 mt-[30px] h-[78px] bg-white border border-[#dfe3e8] rounded-md">
        <div className="absolute left-[12px] top-[12px] w-[331px] h-[53px] flex items-center px-4 bg-gray-100 rounded-md">
          <span className="text-sm text-gray-900 whitespace-nowrap">Lisbon Airport</span>
        </div>
        <div className="absolute left-[353px] top-[12px] w-[331px] h-[54px] flex items-center px-4 bg-gray-100 rounded-md">
          <span className="text-sm text-gray-900 whitespace-nowrap">Nov 12 – Nov 16</span>
        </div>
        <div className="absolute left-[696px] top-[12px] w-[330px] h-[54px] flex items-center px-4 bg-gray-100 rounded-md">
          <span className="text-sm text-gray-900 whitespace-nowrap">10:00 am</span>
        </div>
        <button className="absolute left-[1036px] top-[12px] w-[151px] h-[53px] bg-teal-700 text-white font-medium rounded-md">
          Search
        </button>
      </div>

      <div className="flex gap-[28px] pl-[27px] pr-10 pt-8">
        <aside className="shrink-0 w-[262px] h-[642px] bg-white border border-[#dfe3e8] rounded-md pl-[26px] pr-6 pt-[35px]">
          <h3 className="font-bold text-gray-900">Car type</h3>
          <label className="flex items-center gap-2 mt-[39px] text-sm text-gray-700">
            <input type="checkbox" defaultChecked className="w-5 h-5 accent-teal-700" />
            Small
          </label>
          <label className="flex items-center gap-2 mt-5 text-sm text-gray-700">
            <input type="checkbox" className="w-5 h-5 accent-teal-700" />
            Medium
          </label>
          <label className="flex items-center gap-2 mt-5 text-sm text-gray-700">
            <input type="checkbox" defaultChecked className="w-5 h-5 accent-teal-700" />
            SUV
          </label>
          <label className="flex items-center gap-2 mt-5 text-sm text-gray-700">
            <input type="checkbox" className="w-5 h-5 accent-teal-700" />
            Van
          </label>
          <h3 className="font-bold text-gray-900 mt-[49px]">Gearbox</h3>
          <label className="flex items-center gap-2 mt-[39px] text-sm text-gray-700">
            <input type="checkbox" defaultChecked className="w-5 h-5 accent-teal-700" />
            Automatic
          </label>
          <label className="flex items-center gap-2 mt-5 text-sm text-gray-700">
            <input type="checkbox" className="w-5 h-5 accent-teal-700" />
            Manual
          </label>
        </aside>

        <section className="flex flex-col gap-5 ml-[12px] w-[912px]">
          {cars.map((car, i) => (
            <article
              key={car.name}
              className={`relative box-border h-[192px] bg-white border border-[#dfe3e8] rounded-md ${i === 2 ? 'w-[912px]' : 'w-[911px]'}`}
            >
              <div className="absolute left-[27px] top-[25px] w-[241px] h-[141px] bg-[#dbe2ee] rounded" />

              <div className="absolute left-[296px] top-[25px] h-[141px] flex flex-col justify-center">
                <h3 className="text-xl font-bold text-gray-900">{car.name}</h3>
                <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                  <span>{car.seats}</span>
                  <span className="inline-block w-1 h-1 rounded-full bg-gray-400" />
                  <span>{car.gearbox}</span>
                </p>
              </div>

              <div className="absolute right-[27px] top-[48px] text-right">
                <div className="text-2xl font-bold text-gray-900">{car.price}</div>
                <div className="text-sm text-gray-500">per day</div>
              </div>

              <button className="absolute left-[753px] top-[105px] w-[131px] h-[47px] bg-teal-700 text-white font-medium rounded-md">
                Select
              </button>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
