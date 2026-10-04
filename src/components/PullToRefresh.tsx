import { useEffect, useState } from "react";

const THRESHOLD = 90; // Fingerweg in px, ab dem Loslassen neu lädt

/** Ganz oben nach unten ziehen lädt die App neu (holt auch einen frisch geplanten Tag und App-Updates). */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = document.getElementById("scroller");
    if (!el) return;
    let start: number | null = null;
    let dist = 0;
    const down = (e: TouchEvent) => { start = el.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; dist = 0; };
    const move = (e: TouchEvent) => {
      if (start === null) return;
      if (el.scrollTop > 0) { start = null; setPull(0); return; }
      dist = Math.max(0, e.touches[0].clientY - start);
      setPull(dist);
    };
    const up = () => {
      const go = start !== null && dist >= THRESHOLD;
      start = null;
      setPull(0);
      if (!go) return;
      setBusy(true);
      location.reload();
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", up);
    const cancel = () => { start = null; setPull(0); };
    el.addEventListener("touchcancel", cancel);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", cancel);
    };
  }, []);

  if (!busy && pull < 12) return null;
  const ready = busy || pull >= THRESHOLD;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)", opacity: busy ? 1 : Math.min(1, pull / THRESHOLD) }}>
      <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-soft shadow-sm">
        {busy ? "Aktualisiere …" : ready ? "Loslassen zum Aktualisieren" : "Zum Aktualisieren ziehen"}
      </span>
    </div>
  );
}
