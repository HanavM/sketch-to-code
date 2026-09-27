/**
 * A component with REAL typed props, which the rest of this demo app lacked.
 *
 * Everything else here renders from module-level data, so there was nothing
 * for a props panel to read: the only prop in the whole app was `children`.
 * This one deliberately covers each kind of control the panel has to derive
 * from a type — a string, a number, a boolean, a union of string literals —
 * plus one prop (`onPick`) that no simple control can honestly represent, so
 * the greyed-out-with-a-reason path is exercised by something real.
 */
type Tone = 'neutral' | 'accent' | 'warn'

interface PlanCardProps {
  title: string
  seats: number
  featured?: boolean
  tone?: Tone
  onPick?: () => void
}

const toneClass: Record<Tone, string> = {
  neutral: 'border-gray-200 bg-white',
  accent: 'border-blue-300 bg-blue-50',
  warn: 'border-amber-300 bg-amber-50',
}

export default function PlanCard({
  title,
  seats,
  featured = false,
  tone = 'neutral',
  onPick,
}: PlanCardProps) {
  return (
    <section className={`rounded-lg border p-6 shadow-sm ${toneClass[tone]}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {featured && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
            Most popular
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-600">{seats} seats included</p>
      <button
        type="button"
        onClick={onPick}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Choose {title}
      </button>
    </section>
  )
}
