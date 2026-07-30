"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "leaderboard" },
  { href: "/topics", label: "topics" },
  { href: "/channels", label: "channels" },
  { href: "/compare", label: "compare" },
]

export function NavLinks() {
  const path = usePathname()
  return (
    <nav>
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href)
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : undefined}>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
