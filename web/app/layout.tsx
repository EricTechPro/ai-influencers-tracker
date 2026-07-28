import type { Metadata } from "next"
import type { ReactNode } from "react"
import { loadMeta } from "@/lib/bundles"
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
            <NavLinks />
            <div className="right">
              <span className="num">
                snapshot {meta.generated_at.slice(0, 10)} · {meta.snapshot_health.days_present} of{" "}
                {meta.snapshot_health.days_present + meta.snapshot_health.days_missing} days
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
