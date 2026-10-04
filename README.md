# Satz & Strecke

Trainings-App fürs iPhone: Krafttraining mit automatischer Progression, Läufe und Körpergewicht.
Umsetzung der Planung „Gym Tracker – Milestone 1“ (anml) als reine Web-App: **alle Daten bleiben auf dem Gerät**, kein Server, kein Konto, kostenlos hostbar auf Cloudflare Pages oder GitHub Pages.

## Funktionen

- **Pläne** mit Übungen, Aufwärm- und Arbeitssätzen
- **Progression** (doppelte Progression): Erreichst du in einem Satz die obere Wiederholungszahl, schlägt die App beim nächsten Mal mehr Gewicht vor und startet wieder bei der unteren Zahl. Sonst gleiches Gewicht, eine Wiederholung mehr.
  - Historie gilt je Übung und Satz-Nummer, planübergreifend
  - Einstellungen werden vererbt: Satz → Übung im Plan → Standard unter „Ich“
  - Standard: 5–8 Wdh., +2,5 kg, Aufwärmen mit 50 % vom Arbeitsgewicht
- **Training**: Vorschläge als Platzhalter, mit ✓ abhaken übernimmt sie, Pausen-Timer mit Ton, Bildschirm bleibt an, übersteht Schließen der App
- **Übungsbibliothek** (49 Übungen) plus eigene, mit Bestwert, geschätztem 1RM und Verlauf
- **Läufe** mit Pace, **Körpergewicht** mit Verlauf und BMI
- **Wochenübersicht**, Verlauf mit Bestwert-Markierung
- Offline-fähig, installierbar auf dem Home-Bildschirm, Hell- und Dunkelmodus
- **Sicherung** als JSON-Datei (iPhone: Teilen-Menü → „In Dateien sichern“)

## Technik

| Bereich | Planung (anml) | Hier |
|---|---|---|
| Frontend | React 19, TypeScript, Tailwind 4 | gleich, mit Vite |
| Daten | Laravel + SQLite auf dem Server | IndexedDB (Dexie) auf dem Gerät |
| Tests | Pest | Vitest (+ fake-indexeddb) |
| Hosting | Server/Docker | statisch, Cloudflare Pages |

Die Tabellen entsprechen dem Plan: `exercises`, `routines`, `routineExercises`, `setTemplates`, `sessions`, `loggedExercises`, `loggedSets`, `bodyweight`, dazu `runs`. Die User-Tabelle entfällt, ihre Felder liegen in `settings`.

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Progression und Datenbank
npm run build    # erzeugt dist/
```

Auf dem iPhone im selben WLAN testen: `npm run dev -- --host` und die angezeigte Netzwerk-Adresse öffnen.

## Veröffentlichen

Projekt auf GitHub hochladen (Repo vorher auf github.com leer anlegen):

```bash
git init
git add .
git commit -m "Erste Version"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/satz-und-strecke.git
git push -u origin main
```

### Cloudflare Pages (empfohlen)

1. dash.cloudflare.com → „Workers & Pages“ → „Create“ → „Pages“ → „Connect to Git“, Repo wählen
2. Framework preset: **None**, Build command: `npm run build`, Build output directory: `dist`
3. „Save and Deploy“ → läuft unter `https://satz-und-strecke.pages.dev`

Jeder `git push` veröffentlicht automatisch. Private Repos sind möglich.

### GitHub Pages (Alternative)

Repo → Settings → Pages → Source: **GitHub Actions**. Der Workflow in `.github/workflows/github-pages.yml` testet, baut und veröffentlicht bei jedem Push nach `https://DEIN-NAME.github.io/satz-und-strecke/`. Im Gratis-Tarif muss das Repo öffentlich sein (nur der Code, deine Daten bleiben auf dem Handy).

## Aufs iPhone

1. Adresse in **Safari** öffnen
2. Teilen-Symbol → **„Zum Home-Bildschirm“**
3. Ab jetzt über das Icon starten

Wichtig: Nur als Home-Bildschirm-App behält iOS die Daten dauerhaft. Im normalen Safari-Tab kann iOS Website-Daten nach längerer Nichtnutzung löschen. Unabhängig davon regelmäßig unter „Ich“ → „Sicherung speichern“ eine Datei in iCloud Drive ablegen.

Updates kommen automatisch: Nach einem Push lädt die App beim nächsten Öffnen die neue Version.

## Struktur

```
src/db/types.ts          Datenmodell
src/db/db.ts             Datenbank, Standardwerte, Übungsbibliothek
src/db/repo.ts           Training starten/speichern, Sicherung
src/lib/progression.ts   Progressions-Engine (reine Funktionen, getestet)
src/screens/             Bildschirme
src/components/          UI-Bausteine, Diagramm, Übungsauswahl
public/_headers          Cache-Regeln für Cloudflare Pages
```

## Ideen für später

- Abbau bei Stagnation (z. B. nach 3 verfehlten Trainings −10 %)
- Supersätze, RPE, Notizen pro Satz
- Sync zwischen Geräten über Cloudflare Workers + D1 (Schema ist SQLite-kompatibel)
- GPX-Import für Läufe
