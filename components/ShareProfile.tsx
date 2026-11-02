"use client";

import { useState } from "react";

/** Shares a profile link: the phone's share sheet where there is one, otherwise copy to clipboard. */
export function ShareProfile({ url, name, className = "btn btn-seal", label = "Share profile" }: { url: string; name: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const data = { title: `${name} on Sealed`, text: `Work with ${name}. Payments held by PayPal until you approve.`, url };
        try {
          if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
            await navigator.share(data);
            return;
          }
        } catch {
          return; // cancelled
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy your profile link", url);
        }
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V13" />
      </svg>
      {copied ? "Link copied" : label}
    </button>
  );
}
