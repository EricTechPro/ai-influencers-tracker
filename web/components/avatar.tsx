import { initials } from "@/lib/trust"

/**
 * One identity circle for every surface: real profile image when `src` is set,
 * colored initials when it is null.
 *
 * Purely presentational and safe inside client components. The decision of
 * whether a file exists is made server-side by `channelAvatarUrl` and arrives
 * here as a plain string-or-null prop, so a missing file falls back to initials
 * without ever flashing a broken image.
 *
 * Size is a free number rather than a fixed set, because the right size is a
 * property of the surface: a table row wants a face you can scan past, a card
 * wants one you can recognise. Both are driven from here so a bump is one
 * number, not a CSS class hunt.
 */
export function Avatar({
  src,
  name,
  size = 20,
  isSelf = false,
  title,
  className,
  style,
}: {
  src: string | null
  name: string
  size?: number
  isSelf?: boolean
  title?: string
  className?: string
  style?: React.CSSProperties
}) {
  const cls = ["avatar", isSelf ? "av-you" : "", className ?? ""].filter(Boolean).join(" ")
  // Initials have to shrink with the circle or they spill out of it; 0.38 is
  // the ratio the mockup board used at 32px, applied at every size.
  const box = { width: size, height: size, fontSize: Math.round(size * 0.38), ...style }

  if (src === null) {
    return (
      <span className={cls} title={title} style={box}>
        {initials(name)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cls}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      title={title}
      style={box}
    />
  )
}

/**
 * An Avatar that blows up on hover into a face you can actually identify.
 *
 * The roster is 72 people whose names are mostly "<First Last> | AI
 * Automation", so the inline face is small enough to scan a table with and
 * useless for recognising anyone. This gives the second reading without a
 * click or a page change. CSS-only and no popover library: the project ships
 * none, and `:focus-within` on the tabbable wrapper hands the keyboard the
 * same affordance the mouse gets.
 */
export function AvatarPeek({
  src,
  name,
  handle,
  size = 20,
  isSelf = false,
}: {
  src: string | null
  name: string
  handle?: string | null
  size?: number
  isSelf?: boolean
}) {
  return (
    <span className="avpeek" tabIndex={0} aria-label={name}>
      <Avatar src={src} name={name} size={size} isSelf={isSelf} />
      <span className="avpop" aria-hidden="true">
        <Avatar src={src} name={name} size={176} isSelf={isSelf} className="avpop-face" />
        <span className="avpop-meta">
          <b>{name}</b>
          {handle && <span className="mono10">@{handle}</span>}
        </span>
      </span>
    </span>
  )
}
