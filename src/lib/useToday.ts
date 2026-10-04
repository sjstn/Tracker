import { useEffect, useState } from "react";
import { isoDate } from "./format";

/** Heutiges Datum; wird neu bestimmt, wenn die App wieder in den Vordergrund kommt (z. B. nach Mitternacht). */
export function useToday(): string {
  const [today, setToday] = useState(isoDate);
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") setToday(isoDate()); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return today;
}
