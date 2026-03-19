# Self-Hosted GitHub Actions Runner Setup

## Warum Self-Hosted?

GitHub Actions Free-Tier-Minuten sind aufgebraucht. Ein Docker-basierter Self-Hosted Runner laeuft lokal auf dem Entwicklungsrechner und verbraucht keine GitHub-Minuten.

## Voraussetzungen

- Docker Desktop installiert und gestartet
- Git Bash oder PowerShell
- GitHub Personal Access Token mit `repo` Scope

## Setup (5 Minuten)

### Schritt 1: GitHub Token erstellen

1. Gehe zu https://github.com/settings/tokens
2. "Generate new token (classic)" klicken
3. Scope auswaehlen: **repo** (Full control of private repositories)
4. Token kopieren (wird nur einmal angezeigt)

### Schritt 2: Environment konfigurieren

```bash
cd .github/runner
cp .env.example .env
```

Die `.env` Datei editieren und `GITHUB_TOKEN` eintragen:

```
GITHUB_TOKEN=ghp_dein_token_hier
GITHUB_REPOSITORY=osaka2077/balage-ainw
```

### Schritt 3: Runner starten

```bash
cd .github/runner
docker compose up -d --build
```

Erster Build dauert ca. 2-3 Minuten (Node.js 22 + Runner Download).

### Schritt 4: Verifizieren

```bash
# Logs pruefen
docker compose logs -f

# Sollte zeigen: "Runner configured. Starting..."
# Und dann: "Listening for Jobs"
```

Alternativ in GitHub pruefen:
- Repository Settings > Actions > Runners
- Runner "balage-ci-runner" sollte als "Idle" erscheinen

## Betrieb

### Runner stoppen (deregistriert sich automatisch)

```bash
cd .github/runner
docker compose down
```

### Runner neustarten

```bash
cd .github/runner
docker compose restart
```

### Logs anschauen

```bash
docker compose logs -f github-runner
```

### Runner-Version updaten

In `.github/runner/Dockerfile` die `RUNNER_VERSION` anpassen und neu bauen:

```bash
docker compose up -d --build
```

## Wie es funktioniert

```
Push/PR auf GitHub
       |
       v
GitHub sendet Job an registrierten Runner
       |
       v
Docker-Container fuehrt aus:
  1. actions/checkout (klont Repo)
  2. actions/setup-node (Node 22 + npm Cache)
  3. npm ci
  4. npx tsc --noEmit
  5. npx vitest run
       |
       v
Ergebnis zurueck an GitHub (gruener/roter Check)
```

## Resource Limits

Der Runner ist begrenzt auf:
- **CPU:** max 4 Cores
- **RAM:** max 4 GB (min 1 GB reserviert)
- **Temp:** 512 MB tmpfs fuer schnelle I/O

Falls Tests wegen Speicher fehlschlagen, in `docker-compose.yml` das Memory-Limit erhoehen.

## Sicherheitshinweise

- `.env` Datei ist in `.gitignore` und wird NICHT committed
- Runner laeuft als non-root User im Container
- Container hat `no-new-privileges` Security-Option
- Runner deregistriert sich automatisch bei `docker compose down`
- Token niemals in Logs oder Commits

## Troubleshooting

### "Could not obtain registration token"

- Token hat keinen `repo` Scope
- Token ist abgelaufen
- Repository-Name ist falsch (Format: `owner/repo`)

### Runner erscheint nicht in GitHub Settings

```bash
docker compose logs github-runner | grep -i error
```

Haeufig: Netzwerk-Problem oder Token ungueltig.

### Jobs starten nicht

- Runner muss als "Idle" in GitHub Settings erscheinen
- `runs-on: self-hosted` muss im Workflow stehen
- Labels muessen matchen (default: `self-hosted,linux,x64`)

### npm ci schlaegt fehl (Out of Memory)

Memory-Limit in `docker-compose.yml` erhoehen:

```yaml
deploy:
  resources:
    limits:
      memory: 6G
```

Dann `docker compose up -d` ausfuehren.
