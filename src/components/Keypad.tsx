import type { ReactNode } from "react";

/** Eigenes Zahlenfeld fürs Training: Die iOS-Zahlentastatur hat keine Enter-Taste, hier gibt es "Weiter" und "✓". */
export function Keypad({ title, decimal, last, onKey, onStep, onNext, onClose }: {
  title: string; decimal: boolean; last: boolean;
  onKey: (key: string) => void; onStep: (dir: -1 | 1) => void; onNext: () => void; onClose: () => void;
}) {
  const key = (label: ReactNode, onClick: () => void, aria?: string, cls = "bg-surface text-ink") => (
    <button type="button" onClick={onClick} aria-label={aria}
      className={`no-callout h-12 touch-manipulation rounded-lg text-xl font-semibold shadow-sm active:bg-tint ${cls}`}>{label}</button>
  );
  const digit = (d: string) => key(d, () => onKey(d));
  return (
    <div className="px-3 pt-2" role="group" aria-label={title}>
      <p className="mb-1.5 px-1 text-xs font-medium text-soft">{title}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {digit("1")}{digit("2")}{digit("3")}{key("⌫", () => onKey("back"), "Löschen", "bg-surface-2 text-ink")}
        {digit("4")}{digit("5")}{digit("6")}{key("−", () => onStep(-1), "Weniger", "bg-surface-2 text-ink")}
        {digit("7")}{digit("8")}{digit("9")}{key("+", () => onStep(1), "Mehr", "bg-surface-2 text-ink")}
        {decimal ? key(",", () => onKey(","), "Komma") : <span />}
        {digit("0")}
        {key(<svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="mx-auto h-6 w-6"><path fillRule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06z" clipRule="evenodd" /></svg>, onClose, "Zahlenfeld schließen", "bg-surface-2 text-soft")}
        {last
          ? key("✓", onNext, "Satz abhaken", "bg-ok text-white")
          : key(<span className="text-base">Weiter</span>, onNext, "Weiter zu den Wiederholungen", "bg-plate text-white")}
      </div>
    </div>
  );
}
