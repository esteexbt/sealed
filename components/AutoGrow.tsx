"use client";

import { useEffect } from "react";

/**
 * Every text box in Sealed starts small and grows with what's typed. Modern Chrome and Edge do this
 * in CSS (field-sizing: content); this fills in for browsers that don't, such as Safari and Firefox.
 */
export function AutoGrow() {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) return;
    const fit = (t: HTMLTextAreaElement) => {
      if (t.dataset.fixed !== undefined) return;
      const max = parseFloat(getComputedStyle(t).maxHeight) || Infinity;
      t.style.height = "auto";
      t.style.height = `${Math.min(t.scrollHeight + 2, max)}px`;
    };
    const onInput = (e: Event) => e.target instanceof HTMLTextAreaElement && fit(e.target);
    const fitAll = () => document.querySelectorAll<HTMLTextAreaElement>("textarea.textarea").forEach(fit);
    document.addEventListener("input", onInput);
    const mo = new MutationObserver(fitAll);
    mo.observe(document.body, { childList: true, subtree: true });
    fitAll();
    return () => {
      document.removeEventListener("input", onInput);
      mo.disconnect();
    };
  }, []);
  return null;
}
