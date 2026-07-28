import { bucketText, deltaText, fmtInt, initials, pctText } from "@/lib/trust"
import type { CardModel } from "@/lib/growth"
import { Chip, Derived } from "./trust"
import { Sparkline } from "./sparkline"

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export function GrowthCard({ card, window }: { card: CardModel; window: string }) {
  const g = card.growth
  const classes = ["gcard"]
  if (card.rank === 1) classes.push("top1")
  if (card.is_self) classes.push("youcard")
  const measurable = g.state === "ok" || g.state === "bounded"
  return (
    <div className={classes.join(" ")}>
      <span className="rank-numeral">{card.rank ?? "--"}</span>
      <div className="id">
        <span className="rank">{MEDALS[card.rank ?? 0] ?? (card.rank !== null ? `#${card.rank}` : "--")}</span>
        <span className={card.is_self ? "avatar av20 av-you" : "avatar av20"}>
          {initials(card.name)}
        </span>
        <div className="who">
          <b>
            {card.is_self ? "★ " : ""}
            {card.name}
          </b>
          <span>@{card.handle}</span>
        </div>
        {card.is_self && <Chip variant="you">YOU</Chip>}
      </div>
      <div className="hero">
        {measurable ? (
          <span className="n">
            <Derived formula={`subscriber delta ÷ subscribers at window start, ${window}`}>
              {pctText(g)}
            </Derived>
          </span>
        ) : (
          <span className="n muted">{pctText(g)}</span>
        )}
        <span className="u">subscriber growth {window}</span>
      </div>
      {measurable && (
        <>
          <div className="statline">
            <span className="v">
              <Derived formula="subscriber_count newest minus oldest in window">
                {deltaText(card.delta)}
              </Derived>
            </span>{" "}
            subs <Chip>{bucketText(card.bucket)}</Chip>
          </div>
          <div className="statline">
            <span className="v">
              <Derived formula="subscriber delta ÷ (view delta ÷ 1000)">
                {card.subsPer1k.state === "ok"
                  ? (card.subsPer1k.value ?? 0).toFixed(1)
                  : deltaText(card.subsPer1k)}
              </Derived>
            </span>{" "}
            subs / 1k views
          </div>
          <div className="statline">
            {card.videos30d ?? "--"} videos ·{" "}
            {card.medianViews30d !== null ? fmtInt(card.medianViews30d) : "--"} med · 30d
          </div>
          {g.state === "bounded" ? (
            <p className="note">
              below this channel&apos;s floor: bucket {bucketText(card.bucket)}, so anything under{" "}
              {deltaText(card.delta).replace("< ", "")} cannot be measured
            </p>
          ) : (
            <Sparkline points={card.spark} />
          )}
        </>
      )}
      <div className="gfoot">
        <span>{window}</span>
        <span>{bucketText(card.bucket)}</span>
      </div>
    </div>
  )
}
