export function BuildingCallout({ have, need }: { have: number; need: number }) {
  return (
    <div className="callout warn">
      <b>
        building, {have} of {need} days
      </b>
      <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
        Growth needs a window of snapshots. You have {have} {have === 1 ? "day" : "days"}. Run the
        vidIQ backfill (360 credits) to buy 365 days of history and this fills in immediately.
      </p>
    </div>
  )
}
