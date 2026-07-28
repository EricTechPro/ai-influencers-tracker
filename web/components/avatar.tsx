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

/** One line in the peek card. `value` is already formatted; `null` renders as
 *  the two-character unmeasured state rather than as a zero. */
export interface PeekStat {
  label: string
  value: string | null
  /** shown under the value in smaller type, e.g. a bucket or a denominator */
  note?: string | null
}

/**
 * `AvatarPeek` lives in its own file because it needs state and a portal, and this one does not:
 * `Avatar` is rendered from server components on four routes and stays there. Re-exported rather
 * than moved so the call sites keep importing one avatar module.
 */
export { AvatarPeek } from "./avatar-peek"
