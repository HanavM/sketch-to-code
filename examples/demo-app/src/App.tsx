import BackgroundFlourish from './components/BackgroundFlourish'
import BrowserChrome from './components/BrowserChrome'
import ChevronTrail from './components/ChevronTrail'
import CompanionDoodle from './components/CompanionDoodle'
import CornerBadge from './components/CornerBadge'
import CrabDoodle from './components/CrabDoodle'
import GutterMarks from './components/GutterMarks'
import Navbar from './components/Navbar'
import PlanCard from './components/PlanCard'
import StatCards from './components/StatCards'
import ContactForm from './components/ContactForm'
import UserTable from './components/UserTable'
import WeeklySchedule from './components/WeeklySchedule'
import SketchShape from './components/SketchShape'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50">
      <Navbar />
      <BackgroundFlourish />
      <main className="relative mx-auto max-w-5xl px-6 py-8">
        <BrowserChrome>
          <div className="relative isolate space-y-8 bg-gray-50 p-6">
      <SketchShape className="absolute left-[267px] top-[385px] s2c-etch" />
            <ChevronTrail />
            <StatCards />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ContactForm />
              <WeeklySchedule />
              <UserTable />
            </div>
            <PlanCard title="Team" seats={12} tone="accent" />
            <CornerBadge />
            <CrabDoodle />
            <CompanionDoodle />
            <GutterMarks />
          </div>
        </BrowserChrome>
      </main>
    </div>
  )
}
