import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { back } from "../lib/router";

type Variant = "primary" | "plate" | "track" | "ghost" | "danger" | "quiet";
const variants: Record<Variant, string> = {
  primary: "bg-plate text-white border-transparent shadow-sm",
  plate: "bg-plate text-white border-transparent shadow-sm",
  track: "bg-track text-ink border-transparent shadow-sm",
  ghost: "bg-transparent text-soft border-line border-dashed",
  danger: "bg-surface text-danger border-line shadow-sm",
  quiet: "bg-surface text-ink border-line shadow-sm",
};

export function Button({ variant = "quiet", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition active:opacity-80 disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}

export function Header({ title, onBack, action }: { title: string; onBack?: (() => void) | true; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-2 flex min-h-14 items-center gap-1 bg-bg/95 px-2 backdrop-blur">
      {onBack && (
        <button type="button" aria-label="Zurück" onClick={onBack === true ? () => back() : onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-soft hover:bg-surface-2">‹</button>
      )}
      <h1 className={`flex-1 truncate text-2xl font-semibold tracking-tight ${onBack ? "" : "pl-2"}`}>{title}</h1>
      {action}
    </header>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-soft">{hint}</span>}
    </label>
  );
}

export const inputCls = "min-h-12 rounded-lg border border-line bg-surface px-3 text-ink shadow-sm placeholder:text-soft/70 focus:border-plate focus:ring-2 focus:ring-plate/30 outline-none";

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  const cls = p.className ?? "";
  return <input {...p} className={`${inputCls} ${/(^|\s)w-/.test(cls) ? "" : "w-full"} ${cls}`} />;
}

export function NumberInput({ value, onChange, decimal = true, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <Input
      {...p}
      value={value}
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="next"
      autoComplete="off"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
      onFocus={(e) => e.target.select()}
    />
  );
}

export function Select({ value, onChange, options, ...p }: { value: string; onChange: (v: string) => void; options: [string, string][] } & Omit<InputHTMLAttributes<HTMLSelectElement>, "onChange" | "value">) {
  return (
    <div className="relative">
      <select {...(p as object)} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-full appearance-none truncate pr-8`}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-soft">
        <path fillRule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-surface/50 p-6 text-center text-sm text-soft">{children}</div>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Sichtbarer Bereich über der Bildschirmtastatur; iOS verkleinert dafür nur den visualViewport, nicht das Layout. */
function useVisibleArea(active: boolean) {
  const [area, setArea] = useState<{ keyboard: number; height: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!active || !v) return;
    const on = () => setArea({ keyboard: Math.max(0, window.innerHeight - v.height - v.offsetTop), height: v.height });
    on();
    v.addEventListener("resize", on);
    v.addEventListener("scroll", on);
    return () => { v.removeEventListener("resize", on); v.removeEventListener("scroll", on); setArea(null); };
  }, [active]);
  return area;
}

/** Bodensheet für Auswahllisten (z. B. Übung hinzufügen). Sitzt immer über der Tastatur. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const area = useVisibleArea(open);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const maxHeight = area ? `${Math.round(area.height * 0.88)}px` : "88dvh";
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      style={{ marginBottom: area?.keyboard || "calc(-1 * var(--app-gap, 0px))", maxHeight }}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border-0 bg-bg p-0 text-ink shadow-xl backdrop:bg-gray-950/50 sm:mx-auto sm:max-w-xl">
      {open && (
        <div className="flex flex-col" style={{ maxHeight }}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold text-plate-ink">Fertig</button>
          </div>
          <div className="overflow-y-auto px-4 pt-3 pb-safe" style={{ paddingBottom: area?.keyboard ? "1rem" : "calc(var(--safe-bottom) + 1rem)" }}>{children}</div>
        </div>
      )}
    </dialog>
  );
}

type ToastMsg = { text: string; action?: { label: string; run: () => void } };
let toastSetter: ((m: ToastMsg | null) => void) | null = null;
export function toast(text: string, action?: ToastMsg["action"]) { toastSetter?.({ text, action }); }
export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => { toastSetter = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    // Mit "Rückgängig" etwas länger stehen lassen
    const t = setTimeout(() => setMsg(null), msg.action ? 5000 : 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div role="status" aria-live="polite"
      className={`fixed left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 transition-opacity ${msg ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ bottom: "calc(var(--safe-bottom) + 5.5rem - var(--app-gap, 0px))" }}>
      <span>{msg?.text}</span>
      {msg?.action && (
        <button type="button" className="font-semibold text-plate" onClick={() => { msg.action!.run(); setMsg(null); }}>
          {msg.action.label}
        </button>
      )}
    </div>
  );
}

/** Weiße Karte mit feinem Rand – das Grundelement im Filament-Stil. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>;
}
