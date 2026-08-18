import type { ReactNode } from 'react'

const dotColor = ['bg-red-400', 'bg-yellow-400', 'bg-green-400']

export default function BrowserChrome({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-3">
        {dotColor.map((c) => (
          <span key={c} className={`h-3 w-3 rounded-full ${c}`} />
        ))}
      </div>
      {children}
    </div>
  )
}
