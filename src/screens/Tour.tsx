import { useRef, useState, type ReactNode } from "react";
import { markTourSeen } from "../db/setup";
import { Button } from "../components/ui";
import { Marker } from "../components/plan/Marker";
import { back, navigate } from "../lib/router";

/** Kurze Einführung nach dem Assistenten; unter „Ich“ erneut abrufbar. */
export function Tour({ from }: { from?: string }) {
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const card = CARDS[i];
  const last = i === CARDS.length - 1;

  const finish = async () => {
    try { await markTourSeen(); } catch { /* nicht schlimm, dann kommt sie eben noch einmal */ }
    if (from === "profile") back("profile");
    else navigate("home", true);
  };
  const go = (n: number) => setI(Math.max(0, Math.min(CARDS.length - 1, n)));

  return (
    <div className="flex h-full flex-col pt-4"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
      }}>
      <div className="flex min-h-11 items-center justify-between">
        <span className="text-xs text-soft tnum">{i + 1}/{CARDS.length}</span>
        {!last && <button type="button" onClick={finish} className="min-h-11 px-2 text-sm font-semibold text-soft">Überspringen</button>}
      </div>

      <div className="flex flex-1 flex-col justify-center" aria-live="polite">
        <div aria-hidden className="rounded-2xl border border-line bg-surface-2 p-4">{card.sketch}</div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{card.title}</h1>
        <p className="mt-2 text-sm text-soft">{card.text}</p>
      </div>

      <div className="flex justify-center gap-1.5 py-4" role="tablist" aria-label="Seiten der Einführung">
        {CARDS.map((c, k) => (
          <button key={c.title} type="button" role="tab" aria-selected={k === i} aria-label={c.title} onClick={() => go(k)}
            className={`h-2 rounded-full transition-all ${k === i ? "w-5 bg-plate" : "w-2 bg-line"}`} />
        ))}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2" style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}>
        <Button disabled={i === 0} onClick={() => go(i - 1)} aria-label="Zurück">‹</Button>
        <Button variant="plate" onClick={last ? finish : () => go(i + 1)}>{last ? "Los geht's" : "Weiter"}</Button>
      </div>
    </div>
  );
}

const CARDS: { title: string; text: string; sketch: ReactNode }[] = [
  {
    title: "Plan anlegen",
    text: "Unter „Pläne“ gibst du deinem Krafttraining einen Namen, z. B. Push oder Ganzkörper A, und tippst auf „Anlegen“.",
    sketch: (
      <>
        <Mock className="flex items-center justify-between px-3 py-2.5">
          <span><b className="block text-sm">Push</b><span className="text-xs text-soft">0 Übungen</span></span>
          <Pill>Start</Pill>
        </Mock>
        <div className="mt-3 flex gap-2">
          <Mock className="flex-1 px-3 py-2.5 text-sm">Pull<Caret /></Mock>
          <Pill big>Anlegen</Pill>
        </div>
      </>
    ),
  },
  {
    title: "Übungen hinzufügen",
    text: "Im Plan auf „Übung hinzufügen“ tippen. Such in der Liste oder tipp einen neuen Namen ein und leg die Übung selbst an.",
    sketch: (
      <>
        <Mock className="px-3 py-2.5 text-sm">Bank<Caret /></Mock>
        <Mock className="mt-2 divide-y divide-line">
          {[["Bankdrücken (Langhantel)", "✓"], ["Bankdrücken (Kurzhantel)", "+"]].map(([n, m]) => (
            <div key={n} className="flex items-center justify-between px-3 py-2 text-sm font-medium">
              {n}<span className={m === "✓" ? "font-semibold text-plate-ink" : "text-soft"}>{m}</span>
            </div>
          ))}
        </Mock>
      </>
    ),
  },
  {
    title: "Reihenfolge ändern",
    text: "Halte eine Übung am Griff ⠿ und zieh sie an ihren Platz. Tippst du auf die Übung, stellst du Sätze und Wiederholungen ein.",
    sketch: (
      <div className="grid gap-2">
        <ExerciseMock name="Bankdrücken" />
        <ExerciseMock name="Schulterdrücken" lifted />
        <ExerciseMock name="Dips" faded />
      </div>
    ),
  },
  {
    title: "Deine Woche",
    text: "Unter „Pläne“ legst du fest, an welchem Tag was dran ist. Auf der Startseite verschiebst du mit „Heute Pause“ oder „Woche ändern“, die App plant den Rest mit.",
    sketch: (
      <>
        <Mock className="grid grid-cols-7 gap-1 p-2 text-center">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, k) => (
            <span key={d} className={`flex flex-col items-center gap-1 rounded-md py-1.5 ${k === 1 ? "bg-tint ring-1 ring-plate/30" : ""}`}>
              <span className={`text-xs ${k === 1 ? "font-semibold text-plate-ink" : "text-soft"}`}>{d}</span>
              {[0, 2, 4].includes(k) && <Marker kind="routine" status={k === 0 ? "done" : "planned"} />}
              {[1, 5].includes(k) && <Marker kind="runPlan" status="planned" />}
            </span>
          ))}
        </Mock>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {["Heute Pause", "Was anderes", "Woche ändern"].map((l) => <Pill key={l}>{l}</Pill>)}
        </div>
      </>
    ),
  },
];

function Mock({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>;
}
function Pill({ children, big }: { children: ReactNode; big?: boolean }) {
  return <span className={`flex min-h-9 items-center justify-center rounded-lg text-xs font-semibold ${big ? "bg-plate px-4 text-white" : "border border-line bg-surface px-2"}`}>{children}</span>;
}
function Caret() {
  return <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-plate" />;
}
function ExerciseMock({ name, lifted, faded }: { name: string; lifted?: boolean; faded?: boolean }) {
  return (
    <div className={`flex items-center rounded-xl border bg-surface ${lifted ? "translate-x-2 -rotate-1 border-plate/40 shadow-lg" : "border-line shadow-sm"} ${faded ? "opacity-60" : ""}`}>
      <span className={`flex h-11 w-9 items-center justify-center ${lifted ? "text-plate-ink" : "text-soft"}`}>⠿</span>
      <span className="flex-1 text-sm font-semibold">{name}</span>
      {lifted && <span className="pr-3 text-sm text-plate-ink">↕</span>}
    </div>
  );
}
