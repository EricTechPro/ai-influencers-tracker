import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Suspense } from "react"
import { loadMeta } from "@/lib/bundles"
import { fmtInt } from "@/lib/trust"
import { NavLinks } from "@/components/nav-links"
import "./globals.css"

// A function, not a static object: the roster's own count (meta.channels.total, the same figure
// every kicker on the site reads) rather than a copy hand-typed here that goes stale the next
// time a channel is added or dropped — as it already had, silently, at 72 instead of 74.
export function generateMetadata(): Metadata {
  const meta = loadMeta()
  return {
    title: "AI Influencers Tracker",
    description: `${meta.channels.total} AI/automation YouTube channels and what to make next`,
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const meta = loadMeta()
  return (
    <html lang="en">
      <body>
        <div className="navrule">
          <header className="appnav">
            <span className="logo">AI INFLUENCERS</span>
            {/* NavLinks calls useSearchParams, which requires a Suspense boundary under
                static rendering. This boundary provides defensive protection: if any route
                becomes static without reading searchParams, the nav will still hydrate correctly. */}
            <Suspense fallback={<nav />}>
              <NavLinks />
            </Suspense>
            <div className="right">
              {/* This used to read "1 of 90 days", counting our own sweep files against the
                  default window. True, and read by everyone as how much history the board has —
                  beside 90-day growth rates measured over a bought year. It now states the
                  history, and the sweep's own coverage rides the hover with the dot beside it. */}
              {/* "369 days of history" read as 369 days of ours. Almost all of it is vidIQ
                  backfill — our own sweep has recorded a handful of days — and `vendor` is a
                  distinct trust tier here, so the readout names the split rather than letting the
                  bought history pass as measured. */}
              <span
                className="num"
                title={
                  `daily sweep: ${meta.snapshot_health.days_present} of the last ` +
                  `${meta.snapshot_health.days_present + meta.snapshot_health.days_missing} days ` +
                  `recorded by us. Everything before that is vidIQ backfill. ` +
                  `History since ${meta.snapshot_health.first_date ?? "--"}.`
                }
              >
                snapshot {meta.generated_at.slice(0, 10)} · {fmtInt(meta.snapshot_health.history_days)}{" "}
                days of history ({fmtInt(meta.snapshot_health.days_present)} swept by us)
              </span>
              <span
                className="livedot"
                role="status"
                title={
                  meta.partial_run
                    ? "today's sweep did not finish for every channel"
                    : "today's sweep finished for every channel"
                }
                style={meta.partial_run ? { background: "var(--warning)" } : undefined}
              >
                <span className="sr-only">
                  {meta.partial_run ? "sweep incomplete" : "sweep complete"}
                </span>
              </span>
            </div>
          </header>
        </div>
        <main className="page">{children}</main>
      </body>
    </html>
  )
}
