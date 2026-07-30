import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Suspense } from "react"
import { loadMeta } from "@/lib/bundles"
import { fmtInt } from "@/lib/trust"
import { NavLinks } from "@/components/nav-links"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI Influencers Tracker",
  description: "72 AI/automation YouTube channels and what to make next",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const meta = loadMeta()
  return (
    <html lang="en">
      <body>
        <div className="navrule">
          <header className="appnav">
            <span className="logo">AI INFLUENCERS</span>
            {/* useSearchParams needs a Suspense boundary under static rendering, and
                /topics has no page-level searchParams read to force it dynamic on its
                own — without this, `npm run build` fails only on that one route. */}
            <Suspense fallback={<nav />}>
              <NavLinks />
            </Suspense>
            <div className="right">
              {/* This used to read "1 of 90 days", counting our own sweep files against the
                  default window. True, and read by everyone as how much history the board has —
                  beside 90-day growth rates measured over a bought year. It now states the
                  history, and the sweep's own coverage rides the hover with the dot beside it. */}
              <span
                className="num"
                title={
                  `daily sweep: ${meta.snapshot_health.days_present} of the last ` +
                  `${meta.snapshot_health.days_present + meta.snapshot_health.days_missing} days ` +
                  `recorded. History since ${meta.snapshot_health.first_date ?? "--"}.`
                }
              >
                snapshot {meta.generated_at.slice(0, 10)} · {fmtInt(meta.snapshot_health.history_days)}{" "}
                days of history
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
