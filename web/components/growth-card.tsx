import Link from "next/link"
import { bucketText, capDeltaText, capPctText, deltaText, fmtInt, heroScale } from "@/lib/trust"
import type { CardModel } from "@/lib/growth"
import { AvatarPeek, type PeekStat } from "./avatar"
import { Chip, Derived } from "./trust"
import { Sparkline } from "./sparkline"

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export function GrowthCard({ card, window, stats }: {
  card: CardModel
  window: string
  stats?: PeekStat[]
}) {
  const g = card.growth
  const classes = ["gcard"]
  if (card.is_self) classes.push("youcard")
  const measurable = g.state === "ok" || g.state === "bounded"

  // Capping is a layout rule, not a claim: whenever it rounds, the exact
  // figure rides along in the Derived formula so the precise number is still
  // one hover away. See lib/trust.ts.
  const rate = capPctText(g)
  const gained = capDeltaText(card.delta)
  const rateFormula = `subscriber delta ÷ subscribers at window start, ${window}${
    rate.exact ? ` · exactly ${rate.exact}` : ""
  }`
  // The bucket used to render on the card face as "±100". It moved in here when the endpoints
  // arrived: "2,680 → 21,700" already carries the same rounding and says far more, so the face
  // shows the two counts and the disclosure stays one hover away rather than being dropped.
  const gainedFormula = `subscriber_count newest minus oldest in window${
    gained.exact ? ` · exactly ${gained.exact}` : ""
  } · YouTube rounds each count to 3 significant figures, so both ends carry ${bucketText(
    card.bucket
  )}`

  // Before and after, the two numbers the delta is the distance between. They are the same
  // endpoints the sparkline labels, and lib/growth's own test pins last-minus-first to the delta.
  const before = card.spark.length >= 2 ? card.spark[0] : null
  const after = card.spark.length >= 2 ? card.spark[card.spark.length - 1] : null

  // Signed like a ticker: green up, red down. This is a measured quantity, so the colour is
  // reporting its sign. States never get it — "building" is not a loss.
  const dir = (cell: typeof g) =>
    cell.value === null || cell.value === undefined ? "" : cell.value < 0 ? " down" : " up"

  return (
    <Link href={`/channels/${card.channel_id}`} className={classes.join(" ")}>
      <div className="id">
        <span className="facewrap">
          <AvatarPeek
            src={card.avatarUrl}
            name={card.name}
            handle={card.handle}
            size={48}
            isSelf={card.is_self}
            stats={stats}
          />
          {MEDALS[card.rank ?? 0] && (
            <span className="medal" aria-hidden="true">
              {MEDALS[card.rank ?? 0]}
            </span>
          )}
        </span>
        <div className="who">
          <b title={card.name}>
            {card.is_self ? "★ " : ""}
            {card.name}
          </b>
          <span>@{card.handle}</span>
        </div>
        {card.is_self ? (
          <Chip variant="you">YOU</Chip>
        ) : (
          card.rank !== null && !MEDALS[card.rank] && <span className="rankpill">#{card.rank}</span>
        )}
      </div>

      {/* One hero, then the count that answers "percent of what", then a single
          secondary stat. The card is read in about ten seconds off a grid of
          five, so anything that is not the ranking number, the thing that
          actually happened, or the shape of it belongs on the channel page.
          The 30d videos/median line went there: it was 30d data wearing a 90d
          card, which asked the reader to hold two windows at once. */}
      <div className="heroes">
        <div className="hero">
          {measurable ? (
            <span
              className={`n${dir(g)}`}
              style={{ fontSize: `calc(1.9rem * ${heroScale(rate.text)})` }}
              title={rate.exact ?? undefined}
            >
              <Derived formula={rateFormula}>{rate.text}</Derived>
            </span>
          ) : (
            // Hero typography on a non-number reads as a broken value. A state
            // gets state styling: quiet, one line, still unmistakably not zero.
            <span className="herostate">{rate.text}</span>
          )}
          <span className="u">growth rate · {window}</span>
        </div>
      </div>

      {measurable && (
        <>
          <div className="gained">
            <span className={`v${dir(card.delta)}`} title={gained.exact ?? undefined}>
              <Derived formula={gainedFormula}>{gained.text}</Derived>
            </span>{" "}
            subs
            {before !== null && after !== null && (
              <span className="ba">
                {fmtInt(before)} <span className="arrow">→</span> {fmtInt(after)}
              </span>
            )}
          </div>
          <div className="statline">
            {card.subsPer1k.state === "ok" ? (
              <>
                <span className="v">
                  <Derived formula="subscriber delta ÷ (view delta ÷ 1000)">
                    {(card.subsPer1k.value ?? 0).toFixed(1)}
                  </Derived>
                </span>{" "}
                subs / 1k views
              </>
            ) : (
              <span className="state">subs / 1k views · {deltaText(card.subsPer1k)}</span>
            )}
          </div>
          {g.state === "bounded" ? (
            <p className="note">
              below this channel&apos;s floor: bucket {bucketText(card.bucket)}, so anything under{" "}
              {gained.text.replace("< ", "")} cannot be measured
            </p>
          ) : card.spark.length >= 2 ? (
            <Sparkline points={card.spark} label={window} />
          ) : (
            // The delta is computed from the window's two endpoints, which can
            // exist when the days between them were never snapshotted. Saying
            // so beats drawing a line out of points we do not have.
            <p className="note">no daily snapshots inside this window yet</p>
          )}
        </>
      )}
      <div className="gfoot">
        <span>subscribers · {window}</span>
      </div>
    </Link>
  )
}
