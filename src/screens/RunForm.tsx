import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "../db/db";
import { Button, Field, Header, Input, NumberInput, toast } from "../components/ui";
import { fmtInput, isoDate, num, pace } from "../lib/format";
import { back, navigate } from "../lib/router";

export function RunForm({ id }: { id?: number }) {
  const existing = useLiveQuery(async () => (id ? (await db.runs.get(id)) ?? null : null), [id]);
  const [date, setDate] = useState(isoDate());
  const [km, setKm] = useState("");
  const [h, setH] = useState(""), [m, setM] = useState(""), [s, setS] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!existing) return;
    setDate(existing.date); setKm(fmtInput(existing.km)); setNote(existing.note ?? "");
    const sec = existing.seconds;
    setH(sec >= 3600 ? String(Math.floor(sec / 3600)) : ""); setM(String(Math.floor((sec % 3600) / 60))); setS(String(sec % 60));
  }, [existing]);

  if (id && existing === undefined) return null;
  const seconds = (num(h) || 0) * 3600 + (num(m) || 0) * 60 + (num(s) || 0);
  const distance = num(km);

  const save = async () => {
    if (!(distance > 0) || !(seconds > 0)) { toast("Trag Distanz und Zeit ein."); return; }
    const run = { date: date || isoDate(), km: distance, seconds: Math.round(seconds), note: note.trim() || null };
    if (id) await db.runs.update(id, run); else await db.runs.add(run);
    toast("Lauf gespeichert");
    back("home");
  };
  const remove = async () => {
    if (!id || !confirm("Diesen Lauf endgültig löschen?")) return;
    await db.runs.delete(id);
    toast("Lauf gelöscht");
    navigate("history", true);
  };

  return (
    <div>
      <Header title={id ? "Lauf bearbeiten" : "Lauf"} onBack />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Distanz in km"><NumberInput value={km} onChange={setKm} placeholder="5,0" className="tnum" /></Field>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium">Zeit</legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberInput decimal={false} aria-label="Stunden" placeholder="Std" value={h} onChange={setH} className="tnum" />
          <NumberInput decimal={false} aria-label="Minuten" placeholder="Min" value={m} onChange={setM} className="tnum" />
          <NumberInput decimal={false} aria-label="Sekunden" placeholder="Sek" value={s} onChange={setS} className="tnum" />
        </div>
      </fieldset>
      <p className="mt-5 rounded-xl border border-line bg-surface p-4 text-4xl font-semibold tracking-tight text-plate-ink shadow-sm tnum" aria-live="polite">
        {pace(seconds, distance)}<span className="ml-2 text-base font-medium tracking-normal text-soft">min/km</span>
      </p>
      <Field label="Notiz" className="mt-5">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Strecke, Gefühl, Wetter"
          className="w-full rounded-lg border border-line bg-surface p-3 text-ink shadow-sm outline-none placeholder:text-soft/70 focus:border-plate focus:ring-2 focus:ring-plate/30" />
      </Field>
      <div className="mt-6 grid gap-2">
        <Button variant="plate" className="text-base" onClick={save}>Lauf speichern</Button>
        {id && <Button variant="danger" onClick={remove}>Lauf löschen</Button>}
      </div>
    </div>
  );
}
