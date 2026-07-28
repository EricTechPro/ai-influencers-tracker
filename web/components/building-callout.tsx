import type { PanelBuildingState } from "@/lib/growth"

/** Renders the panel's cold-start state. `building` names a real have/need;
 *  `no_data` is a distinct fact (no usable snapshot at all yet) and gets its
 *  own honest copy rather than borrowing the building sentence with zeros. */
export function BuildingCallout({ state }: { state: PanelBuildingState }) {
  if (state.kind === "no_data") {
    return (
      <div className="callout warn">
        <b>no snapshots yet</b>
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          None of these channels have a usable subscriber snapshot for this window yet. Growth
          starts building as soon as the daily sweep records one.
        </p>
      </div>
    )
  }
  const { have, need } = state
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
