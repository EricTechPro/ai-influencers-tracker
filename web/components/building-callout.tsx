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
      {/* This used to end "run the vidIQ backfill (360 credits) and this fills
          in immediately", which was advice to buy history the repo already
          held: the shortfall was one absent day at the near end, not a missing
          year at the far one. Naming the gap is the honest version, and only
          the far-end case is worth spending on. */}
      <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
        A {need}-day window needs {need} consecutive daily snapshots and {have}{" "}
        {have === 1 ? "day is" : "days are"} on hand. The daily sweep adds one a day; if the gap is
        older history rather than recent days, the vidIQ backfill buys 365 days for 360 credits.
      </p>
    </div>
  )
}
