"use client";

import { useEffect } from "react";

let locks = 0;
let saved: { html: string; body: string; pad: string } | null = null;

/** Stops the page behind a modal from scrolling. Safe to nest (viewer + dialog). */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    if (locks === 0) {
      // Keep the layout from jumping when the scrollbar disappears.
      const bar = window.innerWidth - html.clientWidth;
      saved = { html: html.style.overflow, body: body.style.overflow, pad: body.style.paddingRight };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (bar > 0) body.style.paddingRight = `${bar}px`;
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        html.style.overflow = saved.html;
        body.style.overflow = saved.body;
        body.style.paddingRight = saved.pad;
        saved = null;
      }
    };
  }, [active]);
}
