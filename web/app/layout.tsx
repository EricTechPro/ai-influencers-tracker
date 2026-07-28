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

/**
 * When the board's data landed, in the most precise form the sweep recorded.
 *
 * `fetched_at_utc` is the newest _raw snapshot's own stamp — a real wall clock. `generated_at` is
 * the build day anchored to midnight UTC, which is what keeps a rebuild byte-identical, so it can
 * say the day and nothing finer. Printing "00:00" off it would be an invented measurement.
 */
function sweptText(fetchedAtUtc: string | null, generatedAt: string): string {
  if (!fetchedAtUtc) return `swept ${generatedAt.slice(0, 10)}`
  const t = new Date(fetchedAtUtc)
  const date = t.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })
  const clock = t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return `swept ${date} ${clock}`
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
              {/* Three lines of readout in the header wrapped under the nav on a laptop. The one
                  thing it has to answer here is how old this is; the rest — how much of the
                  history is ours rather than vidIQ's backfill, and how many of the last 90 days
                  the sweep actually recorded — is the same sentence it always was, on the hover.
                  The clock time comes from the newest _raw snapshot, so it is when the data
                  landed. A sweep written before that stamp existed says its day and stops. */}
              <span
                className="num"
                title={
                  `${fmtInt(meta.snapshot_health.history_days)} days of history, of which ` +
                  `${meta.snapshot_health.days_present} of the last ` +
                  `${meta.snapshot_health.days_present + meta.snapshot_health.days_missing} days ` +
                  `were recorded by us. Everything before that is vidIQ backfill. ` +
                  `History since ${meta.snapshot_health.first_date ?? "--"}.`
                }
              >
                {sweptText(meta.snapshot_health.fetched_at_utc, meta.generated_at)}
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
