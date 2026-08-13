import Navbar from './components/Navbar'
import StatCards from './components/StatCards'
import ContactForm from './components/ContactForm'
import UserTable from './components/UserTable'
import UsersList from './components/UsersList'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <StatCards />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <ContactForm />
          <UserTable />
        </div>
        <UsersList />
      </main>
    </div>
  )
}
