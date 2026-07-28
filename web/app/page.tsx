import { loadMeta } from "@/lib/bundles"

export default function HomePage() {
  const meta = loadMeta()
  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">PIPELINE STATE</span>
        <span className="rule" />
        <span className="cap">build step {meta.build_step}</span>
      </div>
      <div className="callout warn">
        <b>
          building, {meta.snapshot_health.days_present} of {meta.target.window_days} days
        </b>
        <p className="note">
          {meta.channels.ok} of {meta.channels.total} channels ok ·{" "}
          {meta.comment_health.ingested.toLocaleString("en-US")} comments ingested ·{" "}
          {meta.comment_health.classified} classified
        </p>
      </div>
    </section>
  )
}
