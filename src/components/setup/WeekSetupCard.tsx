import { hideWeekCard } from "../../db/setup";
import { navigate } from "../../lib/router";
import { Button, Card, toast } from "../ui";

/** Für bestehende Apps ohne Musterwoche: führt direkt zur Vorlagen-Auswahl. */
export function WeekSetupCard() {
  return (
    <Card className="mt-5 border-plate/40 p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="font-semibold">Woche einrichten?</p>
          <p className="mt-0.5 text-sm text-soft">Wähl eine Vorlage, dann schlägt dir die App jeden Tag das passende Training vor.</p>
        </div>
        <button type="button" aria-label="Hinweis ausblenden" onClick={() => hideWeekCard().catch(() => toast("Konnte nicht gespeichert werden."))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-soft hover:bg-surface-2">✕</button>
      </div>
      <Button variant="plate" className="mt-3 w-full" onClick={() => navigate("setup?step=week")}>Einrichten</Button>
    </Card>
  );
}
