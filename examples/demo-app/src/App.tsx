import BackgroundFlourish from './components/BackgroundFlourish'
import BrowserChrome from './components/BrowserChrome'
import ChevronTrail from './components/ChevronTrail'
import CornerBadge from './components/CornerBadge'
import CrabDoodle from './components/CrabDoodle'
import GutterMarks from './components/GutterMarks'
import Navbar from './components/Navbar'
import StatCards from './components/StatCards'
import ContactForm from './components/ContactForm'
import UserTable from './components/UserTable'
import WeeklySchedule from './components/WeeklySchedule'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50">
      <Navbar />
      <BackgroundFlourish />
      <main className="relative mx-auto max-w-5xl px-6 py-8">
        <BrowserChrome>
          <div className="relative isolate space-y-8 bg-gray-50 p-6">
            <ChevronTrail />
            <StatCards />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ContactForm />
              <WeeklySchedule />
              <UserTable />
            </div>
            <CornerBadge />
            <CrabDoodle />
            <GutterMarks />
          </div>
        </BrowserChrome>
      </main>
    </div>
  )
}
