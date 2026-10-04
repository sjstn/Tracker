// src/screens/Week.tsx
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../db/db";
import type { PlanDay, PlanItem } from "../db/types";
import { Button, Empty, Header, Sheet } from "../components/ui";
import { planAction } from "../components/plan/actions";
import { Marker } from "../components/plan/Marker";
import { itemName, usePlanNames, type PlanNames } from "../components/plan/names";
import { addDays } from "../lib/days";
import { niceDate } from "../lib/format";
import { moveItem, openItems } from "../lib/schedule";
import { useToday } from "../lib/useToday";

export function Week() {
  const today = useToday();
  const names = usePlanNames();
  const days = useLiveQuery(() => db.planDays.where("date").between(today, addDays(today, 6), true, true).toArray(), [today]);
  const [picked, setPicked] = useState<string | null>(null); // Antipp-Modus: gewähltes Item
  const [ask, setAsk] = useState<{ itemId: string; target: string } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Kurz halten, damit normales Scrollen nicht zum Ziehen wird
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  if (!days || !names) return null;

  const apply = async (itemId: string, target: string, how: "add" | "swap") => {
    setAsk(null);
    await planAction((d) => moveItem(d, itemId, target, how, today), how === "swap" ? "Getauscht" : "Verschoben");
  };
  const drop = (itemId: string, target: string) => {
    setPicked(null);
    const src = days.find((d) => d.items.some((i) => i.id === itemId));
    if (!src || src.date === target) return;
    if (openItems(days.find((d) => d.date === target)).length) setAsk({ itemId, target });
    else apply(itemId, target, "add");
  };
  const onDragEnd = (e: DragEndEvent) => { if (e.over) drop(String(e.active.id), String(e.over.id)); };

  return (
    <div>
      <Header title="Woche ändern" onBack />
      <p className="mb-3 text-sm text-soft">Training am Griff ⠿ ziehen oder antippen und dann den Zieltag antippen. Auf einem belegten Tag wählst du Tauschen oder Dazulegen.</p>
      {!days.length && <Empty>Noch kein Wochenplan. Leg ihn unter „Pläne“ an.</Empty>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <ul className="grid gap-2">
          {days.map((d) => (
            <DayRow key={d.date} day={d} today={today} names={names} picked={picked} onPick={setPicked} onTapDay={() => picked && drop(picked, d.date)} />
          ))}
        </ul>
      </DndContext>
      <Sheet open={!!ask} onClose={() => setAsk(null)} title="Tag ist schon belegt">
        <div className="grid gap-2 pb-2">
          <Button variant="plate" onClick={() => ask && apply(ask.itemId, ask.target, "swap")}>Tauschen</Button>
          <Button onClick={() => ask && apply(ask.itemId, ask.target, "add")}>Dazulegen</Button>
        </div>
      </Sheet>
    </div>
  );
}

function DayRow({ day, today, names, picked, onPick, onTapDay }: {
  day: PlanDay; today: string; names: PlanNames; picked: string | null; onPick: (id: string | null) => void; onTapDay: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.date });
  const target = !!picked && !day.items.some((i) => i.id === picked);
  return (
    <li ref={setNodeRef} onClick={onTapDay} aria-label={target ? `Auf ${niceDate(day.date)} legen` : undefined}
      className={`flex gap-3 rounded-xl border p-2.5 shadow-sm ${isOver ? "border-plate bg-tint" : target ? "border-plate/50 bg-surface" : "border-line bg-surface"}`}>
      <span className={`w-16 shrink-0 pt-1.5 text-xs ${day.date === today ? "font-semibold text-plate-ink" : "text-soft"}`}>{day.date === today ? "Heute" : niceDate(day.date)}</span>
      <span className="flex flex-1 flex-col gap-1">
        {day.items.length
          ? day.items.map((i) => <ItemChip key={i.id} item={i} names={names} picked={picked} onPick={onPick} />)
          : <span className="rounded-lg border border-dashed border-line px-2 py-1.5 text-xs text-soft">Pause</span>}
      </span>
    </li>
  );
}

function ItemChip({ item, names, picked, onPick }: { item: PlanItem; names: PlanNames; picked: string | null; onPick: (id: string | null) => void }) {
  const movable = item.status === "planned";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: !movable });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  const name = itemName(names, item);
  return (
    <span ref={setNodeRef} style={style}
      className={`no-callout relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${isDragging ? "z-10 bg-surface shadow-lg ring-1 ring-plate/40" : picked === item.id ? "bg-tint ring-1 ring-plate" : "bg-surface-2"} ${movable ? "" : "opacity-60"}`}>
      <button type="button" aria-disabled={!movable} aria-pressed={picked === item.id}
        onClick={(e) => {
          // Ist schon etwas gewählt, gilt der Tipp dem Tag (Tauschen/Dazulegen), nicht dem Chip
          if (picked && picked !== item.id) return;
          e.stopPropagation();
          if (movable) onPick(picked === item.id ? null : item.id);
        }}
        className="flex min-h-8 flex-1 items-center gap-2 text-left">
        <Marker kind={item.ref.kind} status={item.status} />
        <span className="font-medium">{name}</span>
        {item.status === "done" && <span className="text-xs text-ok">✓ erledigt</span>}
        {item.status === "skipped" && <span className="text-xs text-soft">ausgelassen</span>}
      </button>
      {movable && <span {...listeners} {...attributes} aria-label={`${name} ziehen`} className="touch-none px-2.5 py-1.5 text-soft">⠿</span>}
    </span>
  );
}
