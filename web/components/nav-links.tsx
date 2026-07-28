"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { parseWindow, withWindow } from "@/lib/window"

const LINKS = [
  { href: "/", label: "leaderboard" },
  { href: "/topics", label: "topics" },
  { href: "/channels", label: "channels" },
  { href: "/compare", label: "compare" },
]

/** Reads the current `?w=` so every hop between the five routes keeps the
 *  window the user picked, instead of resetting to the 90d default. */
export function NavLinks() {
  const path = usePathname()
  const w = parseWindow(useSearchParams().get("w") ?? undefined)
  return (
    <nav>
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href)
        return (
          <Link key={l.href} href={withWindow(l.href, w)} className={active ? "active" : undefined}>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
