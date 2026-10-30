import { DOT, LOCKUP, MARK } from "./brandPaths";

type Tone = "primary" | "reverse" | "mono";

const TONES: Record<Tone, { body: string; dot: string; word: string }> = {
  primary: { body: "var(--night)", dot: "var(--seal)", word: "var(--night)" },
  reverse: { body: "#ffffff", dot: "var(--seal-light)", word: "#ffffff" },
  mono: { body: "currentColor", dot: "currentColor", word: "currentColor" },
};

/**
 * The Sealed mark: an envelope folded into a hexagon, closed with a seal.
 * `broken` plays the release moment: the seal opens and turns Released green.
 * `halo` draws a white edge so the mark reads on top of busy previews.
 */
export function Seal({
  size = 64,
  broken = false,
  label = "Sealed",
  tone = "primary",
  halo = false,
}: {
  size?: number;
  broken?: boolean;
  label?: string;
  tone?: Tone;
  halo?: boolean;
  /** Kept for older callers; the mark has no monogram. */
  monogram?: string;
}) {
  const t = TONES[tone];
  const w = (size * MARK.w) / MARK.h;
  return (
    <svg
      className={`seal${broken ? " seal-broken" : ""}`}
      width={w}
      height={size}
      viewBox={`${halo ? -4 : 0} ${halo ? -4 : 0} ${MARK.w + (halo ? 8 : 0)} ${MARK.h + (halo ? 8 : 0)}`}
      role="img"
      aria-label={broken ? "Seal opened: paid" : label}
    >
      {halo && <path d={MARK.body} fill="#fff" stroke="#fff" strokeWidth="9" strokeLinejoin="round" />}
      <path className="seal-body" d={MARK.body} fill={t.body} fillRule="evenodd" />
      <circle className="seal-ring" cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill="none" stroke="var(--paid)" strokeWidth="3" opacity="0" />
      <path className="seal-dot" d={MARK.dot} fill={t.dot} style={{ transformOrigin: `${DOT.cx}px ${DOT.cy}px` }} />
    </svg>
  );
}

/** The horizontal logo: mark and wordmark. */
export function Logo({ height = 30, tone = "primary", label = "Sealed" }: { height?: number; tone?: Tone; label?: string }) {
  const t = TONES[tone];
  return (
    <svg className="logo" width={(height * LOCKUP.w) / LOCKUP.h} height={height} viewBox={`0 0 ${LOCKUP.w} ${LOCKUP.h}`} role="img" aria-label={label}>
      <path d={LOCKUP.body} fill={t.body} fillRule="evenodd" />
      <path d={LOCKUP.dot} fill={t.dot} />
      <path d={LOCKUP.word} fill={t.word} />
    </svg>
  );
}
