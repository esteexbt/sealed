"use client";

import { useId } from "react";

/** Organic wax outline: a circle with soft, deterministic wobble. */
function blobPath(r: number, cx = 50, cy = 50, points = 28) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wobble = Math.sin(i * 2.7) * 2.2 + Math.cos(i * 1.3) * 1.6;
    pts.push([cx + Math.cos(a) * (r + wobble), cy + Math.sin(a) * (r + wobble)]);
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    const mx = (p[0] + n[0]) / 2;
    const my = (p[1] + n[1]) / 2;
    d += ` Q ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  return d + " Z";
}

const OUTLINE = blobPath(44);
const CRACK = "M 54 0 L 49 18 L 56 31 L 47 47 L 55 60 L 46 76 L 52 100";
const LEFT = `${CRACK} L 0 100 L 0 0 Z`;
const RIGHT = `${CRACK} L 100 100 L 100 0 Z`;

export function Seal({
  size = 64,
  broken = false,
  monogram = "S",
  label = "Sealed",
}: {
  size?: number;
  broken?: boolean;
  monogram?: string;
  label?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const face = (
    <>
      <path d={OUTLINE} fill={`url(#wax-${uid})`} />
      <path d={OUTLINE} fill="none" stroke="#5c0716" strokeOpacity=".35" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="#5c0716" strokeOpacity=".45" strokeWidth="2.2" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="#ffffff" strokeOpacity=".18" strokeWidth="1" transform="translate(.8 .8)" />
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Young Serif, Georgia, serif"
        fontSize="34"
        fill="#5c0716"
        fillOpacity=".55"
      >
        {monogram}
      </text>
      <text
        x="49.3"
        y="50.2"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Young Serif, Georgia, serif"
        fontSize="34"
        fill="#ffffff"
        fillOpacity=".22"
      >
        {monogram}
      </text>
      <ellipse cx="36" cy="30" rx="11" ry="6" fill="#fff" fillOpacity=".16" transform="rotate(-30 36 30)" />
    </>
  );
  return (
    <svg
      className={`seal${broken ? " seal-broken" : ""}`}
      width={size}
      height={size}
      viewBox="-10 -10 120 120"
      role="img"
      aria-label={broken ? "Seal broken: paid" : label}
    >
      <defs>
        <radialGradient id={`wax-${uid}`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#d23149" />
          <stop offset=".55" stopColor="#a8142c" />
          <stop offset="1" stopColor="#6d0a1b" />
        </radialGradient>
        <clipPath id={`l-${uid}`}>
          <path d={LEFT} />
        </clipPath>
        <clipPath id={`r-${uid}`}>
          <path d={RIGHT} />
        </clipPath>
      </defs>
      <g className="seal-half seal-left" clipPath={`url(#l-${uid})`}>
        {face}
      </g>
      <g className="seal-half seal-right" clipPath={`url(#r-${uid})`}>
        {face}
      </g>
    </svg>
  );
}
