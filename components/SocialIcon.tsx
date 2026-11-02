import type { SocialKind } from "@/lib/types";

/** Small line icons for profile links, in the same style as the rest of Sealed's icons. */
export function SocialIcon({ kind, size = 16 }: { kind: SocialKind; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (kind) {
    case "website":
      return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5Z" /></svg>);
    case "email":
      return (<svg {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" /></svg>);
    case "x":
      return (<svg {...p}><path d="M5 4.5h3.5l10.5 15H15.5L5 4.5ZM19 4.5l-6 6.8M5 19.5l6-6.8" /></svg>);
    case "linkedin":
      return (<svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 10.5v6M8 7.6v.1M11.5 16.5v-6M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1 1 2.1 2.6v3.5" /></svg>);
    case "instagram":
      return (<svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17" cy="7" r=".6" fill="currentColor" /></svg>);
    case "behance":
      return (<svg {...p}><path d="M3.5 7h4.6a2.4 2.4 0 0 1 0 4.8H3.5V7Zm0 4.8h5a2.6 2.6 0 0 1 0 5.2h-5v-5.2ZM14.5 7.5h5M13.8 13.5h6.6a3.3 3.3 0 1 0-1 2.6" /></svg>);
    case "dribbble":
      return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8 4.6c3.4 4.3 5.3 9.5 6.3 15.3M3.6 10.6c5.2.3 9.6-.9 13.6-4.7M5.8 18c3.2-4 8.4-5.2 14.6-3.7" /></svg>);
    case "github":
      return (<svg {...p}><path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.4c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.3 2.9 5.3 3.2 5.3 3.2a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.6c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /></svg>);
  }
}

/** Five stars, filled to the rating. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`st-${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="var(--held)" />
                <stop offset={`${fill * 100}%`} stopColor="var(--rule)" />
              </linearGradient>
            </defs>
            <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 3 1.1-6.1-4.5-4.3 6.1-.8L12 3.2Z" fill={`url(#st-${i}-${Math.round(fill * 100)})`} />
          </svg>
        );
      })}
    </span>
  );
}
