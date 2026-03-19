# HTML Fixtures fuer Benchmark

Deterministische HTML-Snapshots fuer den Fixture-Benchmark-Modus.
Aktivierung: `BALAGE_FIXTURE_MODE=1 npm run benchmark:real`

## Wie Fixtures erstellen/aktualisieren

1. Automatisch (funktionierende Sites):
   ```bash
   BALAGE_SAVE_SNAPSHOTS=1 npm run benchmark:real
   ```
   Speichert HTML in `tests/real-world/snapshots/` und kopiert automatisch
   nach `tests/real-world/fixtures/{file}.html`.

2. Manuell (bot-geschuetzte Sites):
   - Oeffne die URL in einem normalen Browser
   - Rechtsklick -> "Save as" -> "Webpage, Complete" oder Ctrl+S
   - Speichere nur die .html Datei in `fixtures/{file}.html`

## Naming Convention

Der Dateiname MUSS dem `file`-Feld in der Ground-Truth JSON entsprechen
(= JSON-Dateiname ohne `.json`-Endung).

Beispiele:
- `ground-truth/github-login.json` -> `fixtures/github-login.html`
- `ground-truth/stackoverflow-main.json` -> `fixtures/stackoverflow-main.html`
- `ground-truth/amazon-de-main.json` -> `fixtures/amazon-de-main.html`

## Fixture-Modus ausfuehren

```bash
# Alle Benchmarks mit lokalen Fixtures statt Live-Fetch
BALAGE_FIXTURE_MODE=1 npx vitest run tests/real-world/benchmark.test.ts --reporter=verbose

# Nur Fixture-Modus (Kurzform, falls npm-Script definiert)
BALAGE_FIXTURE_MODE=1 npm run benchmark:real
```

## Hinweise

- `.html`-Dateien werden NICHT in Git committed (zu gross)
- Nur `README.md` und `.gitkeep` sind versioniert
- Fehlt ein Fixture im Fixture-Modus, wird auf Live-Fetch zurueckgefallen
- Das Fixture-Logging am Anfang zeigt welche Fixtures vorhanden/fehlend sind
