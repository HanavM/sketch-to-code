import Curtain from './components/Curtain'
import Curtain2 from './components/Curtain2'

export default function App() {
  return (
    <main className="relative h-[900px] w-full overflow-hidden bg-[#1a1024] flow-root">
      <div className="relative mx-auto h-[900px] w-[1280px]">
        {/* header */}
        <header className="absolute left-[2px] top-[1px] flex h-[90px] w-[1276px] items-center justify-center bg-[#d9a441]">
          <h1 className="font-serif text-3xl font-bold tracking-[0.3em] text-[#1a1024]">
            THE STRINGS
          </h1>
        </header>

        {/* left curtain */}
        <div className="absolute left-[1px] top-[89px] h-[631px] w-[352px] overflow-hidden">
          <Curtain className="h-full w-full" />
        </div>

        {/* right curtain */}
        <div className="absolute left-[927px] top-[89px] h-[632px] w-[351px] overflow-hidden">
          <Curtain2 className="h-full w-full" />
        </div>

        {/* stage / spotlight panel */}
        <div className="absolute left-[390px] top-[90px] h-[630px] w-[500px]">
          <div
            className="absolute inset-0"
            style={{ clipPath: 'polygon(200px 0px, 300px 0px, 500px 630px, 0px 630px)' }}
          >
            <div className="absolute inset-x-0 top-[95px] bottom-0 border-t border-white/15 bg-[#4f4040]" />
          </div>

          <div className="absolute left-[5px] top-[27px] flex h-[68px] items-end">
            <span className="whitespace-nowrap font-serif text-[55px] font-bold leading-none text-[#ffe6c7]">
              Small stage, huge
            </span>
          </div>
          <div className="absolute left-[157px] top-[95px] flex h-[68px] items-end">
            <span className="whitespace-nowrap font-serif text-[55px] font-bold leading-none text-[#ffe6c7]">
              drama
            </span>
          </div>

          <p className="absolute left-[50px] top-[302px] w-[400px] text-base text-white/80">
            Marionette plays for grown-ups, five nights a week.
          </p>

          {/* marionette puppet */}
          <div
            className="absolute left-[185px] top-[470px] h-[160px] w-[130px] bg-[#2e86ab]"
            style={{ clipPath: 'polygon(32px 0px, 98px 0px, 130px 160px, 0px 160px)' }}
          />
          <div className="absolute left-[211px] top-[390px] h-[80px] w-[78px] rounded-full bg-[#f2c9a0]" />
        </div>

        {/* get seats button */}
        <button className="absolute left-[519px] top-[755px] z-10 h-[58px] w-[241px] rounded-full bg-[#d9a441] text-lg font-bold text-[#1a1024]">
          Get Seats
        </button>

        {/* footer */}
        <footer className="absolute left-[2px] top-[719px] h-[179px] w-[1276px] bg-[#5a3a23]">
          <span className="absolute left-[62px] top-[114px] text-base text-white/90">
            Thu to Mon, 8 pm
          </span>
          <span className="absolute left-[1038px] top-[114px] text-base text-white/90">
            Doors at 7:30
          </span>
        </footer>
      </div>
    </main>
  )
}
