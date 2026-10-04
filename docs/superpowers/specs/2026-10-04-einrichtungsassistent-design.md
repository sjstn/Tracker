# Einrichtungs-Assistent – Design

**Datum:** 2026-10-04
**Status:** Abgestimmt, bereit für den Umsetzungsplan
**Rahmen:** Satz & Strecke bleibt eine lokale PWA für eine Person, ohne Konto, Daten in IndexedDB (Dexie), statisch auf GitHub Pages. Baut auf dem Wochenplan auf (`docs/superpowers/specs/2026-10-04-wochenplan-design.md`).

## Ziel

Wer die App neu installiert, ist in zwei Minuten startklar: Angaben zur Person, Trainingsregeln und eine Woche aus einer Vorlage. Danach zeigt die Startseite sofort, was heute dran ist. Bestehende Installationen ohne Woche bekommen eine Karte, die direkt zur Wochen-Einrichtung führt.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Umfang | Basis (Größe, Alter, Gewicht, Trainingsregeln) **plus Wochengerüst**. Kraftpläne werden nur mit Namen angelegt, Übungen kommen danach unter „Pläne“. |
| Wann erscheint er? | Automatisch nur bei **leerer App**, solange er nicht abgeschlossen oder mit „Später“ verlassen wurde. Jederzeit über „Ich → Einrichtung starten“. |
| Bestehende App ohne Woche | Karte „Woche einrichten?“ auf der Startseite; „Einrichten“ startet bei der Vorlage, ✕ blendet sie dauerhaft aus. |
| Woche anlegen | **Vorlage wählen**, dann anpassen. Fehlende Pläne und Laufarten legt der Assistent an. |
| Wiederverwendung | Gibt es einen Kraftplan oder eine Laufart mit gleichem Namen (ohne Groß-/Kleinschreibung), wird sie verwendet statt doppelt angelegt. |
| Speichern | Erst bei „Fertig“, in einer Transaktion. Abbrechen ändert nichts. |
| Überspringen | Jeder Schritt außer „Vorlage wählen“ hat „Überspringen“; der Schritt übernimmt dann keine Änderung. |
| Erneut starten | Felder sind mit den aktuellen Werten vorausgefüllt. |
| Alter | Eingabe als Alter in Jahren, gespeichert als Geburtsjahr (`aktuelles Jahr − Alter`), angezeigt immer als Alter. |

## Schritte

Eigener Bildschirm (Route `setup`) ohne Tab-Leiste, oben Fortschrittsbalken „n/5“ und Zurück-Pfeil. Abgestimmte Mockups: `.superpowers/brainstorm/26149-1791102938/content/assistent-screens.html` (lokal).

0. **Willkommen** – kurzer Text, „Los geht's“ / „Später“. „Später“ setzt `setupSeen` und führt zur Startseite.
1. **Über dich** – Körpergröße (cm), Alter (Jahre), Körpergewicht heute (kg). Vorausgefüllt: Größe und Alter aus den Einstellungen, Gewicht leer mit dem letzten Eintrag als Platzhalter.
2. **Trainingsregeln** – Wiederholungen von–bis, Steigerung (kg oder %), Aufwärmen (% vom Arbeitsgewicht oder kg fest). Vorausgefüllt mit den aktuellen Einstellungen (Standard 5–8, +2,5 kg, 50 %). Darunter ein Rechenbeispiel. Knöpfe „Passt so“ / „Überspringen“.
3. **Vorlage wählen** – fünf Vorlagen mit Mini-Wochenvorschau, eine ist ausgewählt. Beim erneuten Start ist „Aktuelle Woche behalten“ als zusätzliche erste Option vorausgewählt, wenn bereits eine Woche existiert.
4. **Woche anpassen** – derselbe Ablauf wie der Musterwoche-Editor: ✕ entfernt, „+“ öffnet eine Auswahl aus vorhandenen und im Entwurf vorkommenden Kraftplänen und Laufarten plus Eingabefeld „Neuer Kraftplan“ / „Neue Laufart“. Darunter Schalter Fortlaufend / Feste Woche.
5. **Laufziele** – nur, wenn die Woche Laufarten enthält: je Laufart Ziel Dauer (min) oder Distanz (km) und Pace von–bis (min/km). Vorausgefüllt aus bestehender Laufart, sonst aus der Vorlage, sonst 45 min ohne Pace. Validierung wie beim Laufart-Formular (`validateRunPlan`).
6. **Fertig** – speichert, zeigt „Heute ist … dran“ (oder „Heute ist Ruhetag“) und listet Kraftpläne ohne Übungen mit Link „Übungen ›“ zu `routine/<id>`. Knopf „Zur Startseite“.

Start über die Karte: `setup?step=week` beginnt bei Schritt 3; der Zurück-Pfeil in Schritt 3 verlässt dann den Assistenten.

## Vorlagen

`src/lib/presets.ts`, reine Daten. Kraftpläne und Laufarten werden über Namen benannt; Laufarten tragen ein Standardziel.

| Vorlage | Mo | Di | Mi | Do | Fr | Sa | So |
|---|---|---|---|---|---|---|---|
| Hybrid | Zone 2 | Push | Longrun | Pull + Z2 kurz | – | Intervall | Beine |
| Push / Pull / Beine | Push | – | Pull | – | Beine | – | – |
| Ganzkörper + Laufen | Ganzkörper A | Zone 2 | Ganzkörper B | – | Ganzkörper A | Zone 2 | – |
| Nur Laufen | Zone 2 | – | Intervall | – | Zone 2 | – | Longrun |
| Leer | – | – | – | – | – | – | – |

Standardziele der Laufarten:

| Laufart | Ziel | Pace (min/km) |
|---|---|---|
| Zone 2 | 45 min | 6:30–7:00 |
| Z2 kurz | 20 min | 6:30–7:00 |
| Longrun | 15 km | 6:15–6:45 |
| Intervall | 8 km | 4:30–4:50 |

## Daten

Keine neue Datenbankversion. Neue Felder in `Settings` (mit Standardwerten in `DEFAULT_SETTINGS`, abgesichert in `getSettings`):

```ts
birthYear: number | null;   // Standard null
setupSeen: boolean;         // Standard false
weekCardHidden: boolean;    // Standard false
```

### Entwurf im Assistenten (nur im Arbeitsspeicher)

```ts
type DraftRef = { kind: "routine"; name: string } | { kind: "runPlan"; name: string };
interface SetupDraft {
  heightCm: number | null;
  age: number | null;
  weightKg: number | null;          // null = kein neuer Gewichtseintrag
  progression: ProgressionFields;    // aus types.ts
  week: DraftRef[][];                // 7 Tage ab Montag
  shiftMode: ShiftMode;
  runTargets: Record<string, RunPlanForm>; // Schlüssel = Name in Kleinbuchstaben
}
```

### Speichern: `completeSetup(draft, today?, database?)`

Eine Transaktion über `settings`, `bodyweight`, `routines`, `runPlans`, `planDays`:

1. Einstellungen: Größe, `birthYear` (aus Alter, wenn gesetzt), Progressionsfelder, `shiftMode`, `setupSeen = true`.
2. Wenn `weightKg` gesetzt: neuer Eintrag im Gewichtsverlauf mit dem aktuellen Zeitpunkt.
3. Namen auflösen (reine Funktion `resolveWeek(week, routines, runPlans)`): vorhandene Kraftpläne/Laufarten mit gleichem Namen (ohne Groß-/Kleinschreibung, getrimmt) verwenden, fehlende als neu markieren.
4. Fehlende Kraftpläne anlegen (`order` hinter den bestehenden). Fehlende Laufarten aus `runTargets` anlegen, vorhandene Laufarten mit den Zielen aus `runTargets` aktualisieren.
5. Musterwoche aus den aufgelösten IDs speichern und den Plan neu aufbauen wie `saveWeekSetup` (ab morgen neu, Vorrat bis heute + 13).

Zweimal mit demselben Entwurf ausgeführt, legt `completeSetup` nichts doppelt an.

### Automatischer Start: `isAppEmpty(database?)`

`true`, wenn `sessions`, `runs`, `routines`, `runPlans`, `bodyweight` und `planDays` leer sind und die Musterwoche leer ist. `App.tsx` leitet beim ersten Laden auf `setup` um, wenn `setupSeen` falsch ist und `isAppEmpty()` stimmt.

## Weitere Oberfläche

- **Startseite:** Die Hinweiszeile „Tipp: Unter Pläne …“ wird durch die Karte „Woche einrichten?“ ersetzt. Sichtbar, wenn die Musterwoche leer ist, `weekCardHidden` falsch ist und kein Training läuft.
- **Ich:** Abschnitt „Darstellung“ bleibt; neuer Knopf „Einrichtung starten“ (öffnet `setup`); Feld „Alter“ neben „Körpergröße“ in der Standard-Progression-Karte (Eingabe Alter, gespeichert als `birthYear`).
- **Tab-Leiste:** auf `setup` ausgeblendet, wie beim laufenden Training.

## Sonderfälle

- **Vorlage mit Namen, die es schon gibt:** wird wiederverwendet; ein vorhandener Kraftplan behält seine Übungen.
- **Leere Vorlage, nichts hinzugefügt:** Woche bleibt leer, Schritt 5 entfällt, „Fertig“ zeigt „Leg deine Woche später unter Pläne an“.
- **Training läuft:** „Einrichtung starten“ und die Karte sind dann nicht sichtbar bzw. deaktiviert.
- **Ungültige Eingaben:** Größe 100–250 cm, Alter 10–100, Gewicht 20–400 kg; außerhalb wird das Feld markiert und „Weiter“ erklärt den Fehler. Leere Felder sind erlaubt (= nicht ändern).
- **Abbrechen:** Zurück-Pfeil in Schritt 0 bzw. dem Startschritt oder Browser-Zurück verlässt den Assistenten ohne zu speichern; `setupSeen` bleibt unverändert (außer bei „Später“).

## Tests

- `src/lib/presets.test.ts`: jede Vorlage hat 7 Tage; jede Laufart in Vorlagen hat ein Standardziel; `resolveWeek` verwendet vorhandene Namen (Groß-/Kleinschreibung egal) und markiert nur Fehlende als neu.
- `src/db/setup.test.ts` (fake-indexeddb): `completeSetup` schreibt Einstellungen inkl. `birthYear` und `setupSeen`, legt Gewichtseintrag an, legt fehlende Pläne/Laufarten an, aktualisiert Laufziele, erzeugt 14 Plan-Tage; zweiter Aufruf legt nichts doppelt an; vorhandener Kraftplan behält seine Übungen; `isAppEmpty` vor und nach Datenanlage.
- Browser (hell und dunkel, 400 px): leere App → Assistent startet automatisch, alle Schritte, Startseite zeigt heutiges Training; „Später“; bestehende App → Karte → Assistent ab Vorlage; ✕ blendet Karte aus; „Ich → Einrichtung starten“ mit vorausgefüllten Werten.

## Nicht enthalten

- Übungen im Assistenten auswählen (bleibt im Pläne-Tab).
- Eigene Vorlagen speichern.
- Der Fehler mit dem Abstand unter der Tab-Leiste auf dem iPhone wird separat untersucht.
