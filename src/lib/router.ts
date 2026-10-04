import { useEffect, useState } from "react";

// Hash-Routing: funktioniert auf jedem statischen Host ohne Server-Konfiguration.
export interface Route { name: string; params: Record<string, string> }

export function parseHash(hash = location.hash): Route {
  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const [name, id] = (path || "home").split("/");
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(query || ""));
  if (id) params.id = id;
  return { name: name || "home", params };
}

let depth = 0; // Anzahl Schritte innerhalb der App, damit "Zurück" nie aus der App führt

export function navigate(to: string, replace = false) {
  const url = "#/" + to.replace(/^#?\/?/, "");
  if (replace) history.replaceState({ depth }, "", url);
  else { depth++; history.pushState({ depth }, "", url); }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function back(fallback = "home") {
  if (depth > 0) history.back();
  else navigate(fallback, true);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = (e: Event) => {
      if (e.type === "popstate") depth = history.state?.depth ?? 0;
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => { window.removeEventListener("hashchange", on); window.removeEventListener("popstate", on); };
  }, []);
  return route;
}
