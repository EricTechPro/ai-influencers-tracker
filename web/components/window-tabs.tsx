"use client"

import type { WindowKey } from "@/lib/types"
import { WINDOWS } from "@/lib/types"

/** The window picker, shared rather than copied. Every page that reports a
 *  windowed number has to let you change the window, and three hand-rolled
 *  copies of the same six buttons drift: the leaderboard had them and the
 *  channels index did not, so the same growth rate was selectable on one page
 *  and fixed at 90d on the other. */
export function WindowTabs({ value, onChange, label = "window" }: {
  value: WindowKey
  onChange: (w: WindowKey) => void
  label?: string
}) {
  return (
    <>
      <span className="note">{label}</span>
      <div className="tabs" role="group" aria-label={label}>
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className={w === value ? "on" : undefined}
            aria-pressed={w === value}
            onClick={() => onChange(w)}
          >
            {w}
          </button>
        ))}
      </div>
    </>
  )
}
