export default function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-gray-900">Acme Dashboard</span>
        <div className="flex items-center gap-6">
          <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Overview</a>
          <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Reports</a>
          <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Settings</a>
          <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
