import type { PlanItemStatus } from "../../db/types";

/** Punkt (Kraft) oder Balken (Lauf). Gefüllt = gemacht, Ring = geplant, grau = ausgelassen. */
// Vollständige Klassennamen, damit Tailwind sie findet
const LOOK = {
  routine: { size: "h-2 w-2", planned: "ring-[1.5px] ring-inset ring-plate", done: "bg-plate" },
  runPlan: { size: "h-2 w-4", planned: "ring-[1.5px] ring-inset ring-track", done: "bg-track" },
};

export function Marker({ kind, status = "done" }: { kind: "routine" | "runPlan"; status?: PlanItemStatus }) {
  const l = LOOK[kind];
  const look = status === "skipped" ? "bg-line" : status === "planned" ? l.planned : l.done;
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${l.size} ${look}`} />;
}
