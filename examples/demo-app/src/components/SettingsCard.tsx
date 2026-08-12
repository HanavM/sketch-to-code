export default function SettingsCard() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Workspace settings</h2>
      <p className="mt-4 max-w-2xl text-sm text-gray-600">
        Changes to your workspace name, timezone, and default member role apply to everyone on
        the team. Updates take effect the next time each member signs in.
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </section>
  )
}
