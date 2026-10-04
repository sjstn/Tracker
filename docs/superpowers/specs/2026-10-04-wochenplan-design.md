# Wochenplan mit smarter Verschiebung – Design

**Datum:** 2026-10-04
**Status:** Abgestimmt, bereit für den Umsetzungsplan
**Rahmen:** Satz & Strecke bleibt eine lokale PWA für eine Person, ohne Konto, Daten in IndexedDB (Dexie), statisch gehostet auf GitHub Pages. Kein Server.

## Ziel

Der Nutzer legt eine Musterwoche fest, z. B.:

| Mo | Di | Mi | Do | Fr | Sa | So |
|---|---|---|---|---|---|---|
| Zone-2-Lauf | Push | Longrun | Pull + Z2 kurz | Pause | Intervall-Lauf | Beine |

Hinter jedem Kraft-Eintrag steht ein bestehender Kraftplan (Routine), hinter jedem Lauf-Eintrag eine neue **Laufart** mit Ziel. Die App zeigt jeden Tag, was dran ist. Der Nutzer kann spontan Pause machen (Trainings verschieben oder ausfallen lassen), ein anderes Training vorziehen oder Trainings zwischen Tagen tauschen. Die App passt die folgenden Tage nach festen Regeln an.

Der Einrichtungs-Assistent ist **nicht** Teil dieses Designs. Er folgt als nächstes Projekt und nutzt dann die Musterwoche.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Was passiert mit der Woche beim Verschieben? | Einstellbar. Standard **Fortlaufend** (Trainings als Endlosschleife, Wochentage nur Startpunkt). Alternative **Feste Woche** (jeden Montag neu, Ruhetage schlucken Verschiebungen). |
| Pause heute | Wahl im Moment: **Verschieben** oder **Ausfallen lassen**. |
| Lauf-Trainings | Laufart mit Ziel: Dauer **oder** Distanz, optional Pace-Bereich. Soll/Ist-Vergleich nach dem Eintragen. |
| Mehrere Trainings pro Tag | Ja. Einheit beim Verschieben ist der Tag. |
| Architektur | Konkrete Plan-Tage werden gespeichert (14 Tage Vorrat), Regeln als reine Funktionen. |
| „Was anderes“ | Standard **Tauschen**, wahlweise **Nachrücken**. |
| Vergessene Tage | Die App **fragt nach**: Nachtragen, Verschieben oder Ausgelassen. |
| Einheiten in der Oberfläche | Dauer in **Minuten**, Pace in **min/km** (z. B. 6:15). Intern Sekunden. |

## Daten

Dexie-Version 2. Bestehende Tabellen und Daten bleiben unverändert.

### Neue Tabelle `runPlans` (Laufarten)

```ts
interface RunPlan {
  id?: number;
  name: string;                       // "Longrun"
  targetKind: "duration" | "distance";
  targetValue: number;                // Sekunden bei duration, km bei distance
  paceMin: number | null;             // Sekunden pro km, schnelleres Ende
  paceMax: number | null;             // Sekunden pro km, langsameres Ende
  order: number;
}
```

Eingabe und Anzeige: Dauer in Minuten, Pace als `m:ss` min/km.

### Verweis auf ein Training

```ts
type TrainingRef = { kind: "routine"; id: number } | { kind: "runPlan"; id: number };
```

### Neue Felder in `Settings`

```ts
weekTemplate: TrainingRef[][];        // 7 Einträge, Index 0 = Montag; [] = Ruhetag
shiftMode: "continuous" | "fixedWeek"; // Standard "continuous"
```

Standard: sieben leere Listen. Liegt in den Einstellungen und ist damit Teil der Sicherung.

### Neue Tabelle `planDays`

```ts
interface PlanDay {
  date: string;                        // lokaler Tag "2026-10-06", Primärschlüssel
  seq: number | null;                  // Wochentag der Musterwoche (0–6), aus dem der Tag stammt; null = eingefügte Pause
  items: PlanItem[];
}
interface PlanItem {
  id: string;                          // stabile ID (crypto.randomUUID)
  ref: TrainingRef;
  status: "planned" | "done" | "skipped";
  label: string;                       // Name zum Zeitpunkt der Planung, falls der Plan später gelöscht wird
}
```

Die App hält immer Plan-Tage von heute bis **heute + 13** vor.

### Erweiterte Tabellen

- `sessions.planItemId?: string` – welcher Termin mit diesem Krafttraining erledigt wurde.
- `runs.planItemId?: string`, `runs.runPlanId?: number` – Termin und Laufart für den Soll/Ist-Vergleich.
- `drafts` (laufendes Training) merkt sich `planItemId`, damit der Termin beim Beenden erledigt wird.

### Rückgängig

Vor jeder Plan-Aktion werden die betroffenen `planDays` im Arbeitsspeicher gesichert. „Rückgängig“ in der Meldung schreibt sie zurück. Gilt nur, solange die Meldung sichtbar ist.

## Regeln

Alle Regeln sind reine Funktionen in `src/lib/schedule.ts`: Sie bekommen Plan-Tage (und ggf. Musterwoche, Modus, heute) und geben neue Plan-Tage zurück. **Erledigte und ausgelassene Items werden von keiner Regel bewegt.** „Offen“ heißt im Folgenden `status: "planned"`.

### Erzeugen

- **Fortlaufend:** Der nächste Tag bekommt `seq = (seq des letzten Tages mit seq + 1) mod 7` und die Trainings dieses Musterwochentags. Gibt es noch keinen Tag mit `seq`, startet die Reihenfolge beim Wochentag des ersten zu erzeugenden Datums.
- **Feste Woche:** `seq` ist immer der Wochentag des Datums.

### Heute Pause → Verschieben

- **Fortlaufend:** Heute bekommt einen Pausentag eingefügt: Die offenen Items von heute und alle folgenden Tage (Inhalt und `seq`) rücken einen Tag weiter. Heute behält nur seine erledigten Items, `seq = null`. Der Vorrat wird hinten um einen Tag ergänzt.
- **Feste Woche:** Die offenen Items von heute wandern auf morgen, die von morgen auf übermorgen usw., bis ein Tag ohne offene Items (Ruhetag) derselben Woche erreicht ist. Dieser nimmt die Items auf. Gibt es bis Sonntag keinen solchen Tag, werden die Items, die über Sonntag hinausfallen würden, an ihrem bisherigen Tag als `skipped` markiert. Ab Montag gilt wieder die Musterwoche.

### Heute Pause → Ausfallen lassen

Offene Items von heute → `skipped`. Sonst keine Änderung.

### Was anderes

- **Tauschen:** Offene Items von heute und vom gewählten Tag tauschen den Platz.
- **Nachrücken:** Die offenen Items des gewählten Tages X kommen auf heute. Die offenen Items von heute bis X−1 rücken je einen Tag weiter. X ist danach mit den Items von X−1 belegt, die Lücke ist geschlossen.
- Freies Training oder Lauf ohne Plan bleibt möglich und ändert den Plan nicht.

### Woche ändern (Ziehen oder Antippen)

- Ein offenes Item auf einen künftigen Tag ohne offene Items: Es wird dorthin **verschoben**.
- Auf einen Tag mit offenen Items: Auswahl **Tauschen** (das Item tauscht mit allen offenen Items des Zieltags) oder **Dazulegen** (das Item kommt zusätzlich auf den Zieltag).
- Vergangene Tage und erledigte Items sind nicht ziehbar und kein Ziel.

### Erledigt

- Wird ein Krafttraining oder Lauf mit `planItemId` gespeichert, wird das Item `done`.
- Startet der Nutzer einen Kraftplan, der heute offen geplant ist, wird er automatisch zugeordnet, egal von welchem Bildschirm. Dasselbe gilt für einen Lauf, den er von der Heute-Karte aus einträgt.
- Ein Training, das heute nicht geplant ist, wird ohne Termin gespeichert.
- Wird ein Training oder Lauf gelöscht, geht sein Item zurück auf `planned`.

### Musterwoche oder Modus ändern

Alle Tage **ab morgen** werden aus der neuen Musterwoche neu erzeugt. Erledigte und ausgelassene Items an diesen Tagen bleiben erhalten. Heute bleibt unverändert.

### Vergessene Tage

`overdue(days, today)` liefert alle Tage vor heute mit offenen Items. Die Startseite zeigt sie zuerst:

- Ein Tag: „Dienstag: Push nicht eingetragen“ mit **Nachtragen** (öffnet Krafttraining bzw. Lauf mit Datum dieses Tages), **Verschieben** (wirkt wie „Pause → Verschieben“ an diesem Tag, wobei die Items nie auf einem vergangenen Tag landen, sondern frühestens heute) und **Ausgelassen**.
- Mehrere Tage: „12 Termine offen“ mit **Alle verschieben** (die offenen Items landen in ihrer Reihenfolge ab heute, die bisher geplanten Tage rücken entsprechend nach) und **Alle ausgelassen**. Einzeln nachtragen geht über den Verlauf.

## Oberfläche

Abgestimmte Mockups: `.superpowers/brainstorm/26149-1791102938/content/wochenplan-screens.html` (lokal, nicht im Repo).

1. **Start (`Home.tsx`)**
   - Hinweis auf vergessene Tage, falls vorhanden.
   - Heute-Karte: Kraft mit „Training starten“, Lauf mit Ziel (z. B. „45 min · 6:30–7:00 /km“) und „Ergebnis eintragen“. Mehrere Trainings untereinander.
   - Knöpfe **Heute Pause**, **Was anderes**, **Woche ändern**.
   - Wochenstreifen mit geplanten (●/▬), erledigten (✓) und ausgelassenen Terminen.
   - „Als Nächstes“ mit den nächsten zwei Tagen.
   - Leere Musterwoche: Startseite wie bisher plus Hinweis „Leg unter Pläne deine Woche an“.
2. **Heute Pause (Sheet):** Auswahl Verschieben oder Ausfallen lassen, Vorschau der Woche danach, „Pause eintragen“. Danach Meldung mit „Rückgängig“.
3. **Was anderes (Sheet):** Liste der kommenden offenen Trainings, Schalter „Stattdessen nachrücken“, Bestätigen. Link zu freiem Training oder Lauf ohne Plan.
4. **Woche ändern (`Week.tsx`, neue Seite `week`):** die nächsten 7 Tage als Liste. Items mit Griff ziehen (@dnd-kit) oder antippen und dann den Zieltag antippen. Auf belegtem Tag die Wahl Tauschen oder Dazulegen. Meldung mit „Rückgängig“.
5. **Pläne (`Routines.tsx`):** Musterwoche (7 Zeilen mit Trainings-Chips und „+“), Schalter Fortlaufend/Feste Woche, Kraftpläne, Laufarten.
6. **Laufart bearbeiten (`RunPlanEdit.tsx`, neue Seite `runplan/:id`):** Name, Ziel (Dauer in min oder Distanz in km), Pace von–bis in min/km. Fehler direkt am Feld (leeres Ziel, Pace „von“ langsamer als „bis“).
7. **Lauf eintragen (`RunForm.tsx`):** mit Termin steht das Ziel oben. Nach dem Speichern Soll/Ist: Ziel erreicht ja/nein, Pace im Bereich, zu schnell oder zu langsam.
8. **Verlauf (`History.tsx`):** zeigt ausgelassene Termine dezent grau.

## Sonderfälle

- **Plan oder Laufart löschen:** Rückfrage, falls in der Musterwoche oder in offenen Terminen enthalten. Danach aus der Musterwoche und aus offenen künftigen Items entfernt. Erledigte Items behalten ihr `label`.
- **Mitternacht bei offener App:** Bei `visibilitychange` (sichtbar) wird „heute“ neu bestimmt und `ensureHorizon()` aufgerufen.
- **Datum:** nur lokale Tage als `YYYY-MM-DD`, Tagesarithmetik ohne Uhrzeit. Tests decken Jahreswechsel und Zeitumstellung (25.10.2026) ab.
- **Sicherung:** `runPlans` und `planDays` kommen in `BACKUP_TABLES`. Alte Sicherungen ohne diese Tabellen lassen sich weiter einspielen.

## Fehlerbehandlung

Jede Plan-Aktion läuft in einer Dexie-Transaktion über `planDays` (und ggf. `sessions`/`runs`). Schlägt sie fehl, bleibt der alte Stand, und es erscheint „Konnte nicht gespeichert werden“.

## Tests

Test-first mit Vitest.

- **`src/lib/schedule.test.ts`** (größte Abdeckung): Erzeugen in beiden Modi inkl. Jahreswechsel und Zeitumstellung; Pause verschieben (Fortlaufend; Feste Woche mit Ruhetag; Feste Woche ohne Ruhetag mit Überlauf über Sonntag); Pause ausfallen; Tauschen; Nachrücken; Verschieben auf Ruhetag; Dazulegen; erledigte Items bleiben bei jeder Aktion unberührt; Musterwoche ändern; Moduswechsel; vergessene Tage erkennen; Alle verschieben.
- **`src/db/schedule.test.ts`** (fake-indexeddb): Upgrade v1 → v2 mit Bestandsdaten; 14-Tage-Vorrat; Training beenden erledigt den Termin; Training/Lauf löschen gibt ihn frei; Rückgängig; Sicherung mit und ohne neue Tabellen; Löschen eines Plans räumt Musterwoche und offene Items auf.
- **Pace- und Dauer-Umrechnung** (`format.ts`): `m:ss` ↔ Sekunden, Minuten ↔ Sekunden, ungültige Eingaben.
- **Manuell im Browser** (hell und dunkel): Woche anlegen, Pause verschieben, Tauschen, Ziehen, Lauf mit Soll/Ist, vergessener Tag.

## Nicht enthalten

- Einrichtungs-Assistent (nächstes Projekt, baut auf der Musterwoche auf)
- Strukturierte Intervalle mit Abschnitten, Erinnerungen, Benachrichtigungen
- Statistiken wie Erfüllungsquote pro Woche
