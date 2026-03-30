# GitNexus Agent-Analyse-Plan: Schwachstellen und Optimierung im BALAGE Codebase

> Erstellt: 2026-03-28 | COORDINATOR
> Repo: "Balage  AINW" (2610 Nodes, 6455 Edges, 218 Clusters, 210 Execution Flows)
> Codebase: 200 TS-Dateien (src/), 73 Test-Dateien, 18 Module
> Ziel: Systematische Analyse aller Schwachstellen mit dem 8-Agent-Team via GitNexus

---

## 0. Voraussetzung: GitNexus MCP-Server Restart

Der Analyzer hat auf LadybugDB migriert (.gitnexus/lbug), der MCP-Server sucht
aber noch nach KuzuDB (.gitnexus/kuzu). **Vor Beginn der Analyse:**

```bash
# MCP-Server in settings.json neu starten oder:
npx gitnexus analyze   # Falls noch nicht aktuell
# Dann MCP-Server-Verbindung in Claude Code neu herstellen
```

Alle unten aufgefuehrten Queries sind exakt so ausfuehrbar, sobald der Server laeuft.

---

## 1. Phase 1: Codebase-Mapping (30 Minuten, parallel)

### Ziel
Jeder Agent liest die GitNexus-Ressourcen die fuer sein Gebiet relevant sind.
Kein Agent analysiert noch nichts tief — nur Orientierung und Scope-Absteckung.

### Zuweisungen

| Agent | Liest zuerst | Warum |
|-------|-------------|-------|
| ARCHITECT | `clusters`, `processes`, Schema | Gesamtstruktur, funktionale Areas, alle Execution Flows |
| AI_ENGINEER | `query("LLM pipeline")`, `query("post-processing")` | Versteht die ML-kritischen Pfade |
| ENGINEER | `query("endpoint detection")`, `query("DOM parsing")` | Versteht die Core-Pipeline |
| SECURITY | `query("authentication")`, `query("API key")`, `query("injection")` | Findet alle Security-relevanten Pfade |
| QA | `processes` (vollstaendig), `clusters` | Weiss welche Flows es gibt und welche getestet sein muessen |
| PLATFORM | `query("build")`, `query("benchmark runner")`, `query("configuration")` | Versteht Build-Pipeline und CI |
| STRATEGIST | Cluster-Groessen, Prozess-Komplexitaet | Bewertet wo Komplexitaet = Kosten liegt |

### Konkrete Calls Phase 1

**Alle Agents (gemeinsam):**
```
READ gitnexus://repo/Balage  AINW/context
READ gitnexus://repo/Balage  AINW/clusters
READ gitnexus://repo/Balage  AINW/processes
READ gitnexus://repo/Balage  AINW/schema
```

**ARCHITECT — Strukturelle Uebersicht:**
```
# Alle Cluster mit ihren Mitgliedern laden
READ gitnexus://repo/Balage  AINW/cluster/semantic
READ gitnexus://repo/Balage  AINW/cluster/core
READ gitnexus://repo/Balage  AINW/cluster/orchestrator
READ gitnexus://repo/Balage  AINW/cluster/parser
READ gitnexus://repo/Balage  AINW/cluster/security
```

**AI_ENGINEER — ML-Pipeline-Mapping:**
```
gitnexus_query({
  query: "LLM client semantic analysis endpoint generation",
  repo: "Balage  AINW",
  limit: 10
})

gitnexus_query({
  query: "post-processing type correction deduplication",
  repo: "Balage  AINW",
  limit: 10
})
```

**SECURITY — Attack-Surface-Mapping:**
```
gitnexus_query({
  query: "API key authentication WebSocket credential",
  repo: "Balage  AINW",
  limit: 10
})
```

---

## 2. Phase 2: Deep Analysis (2-3 Stunden, pro Agent parallel)

Jeder Agent fuehrt seine spezifischen Deep-Dives durch. Die Queries sind
nach Schwachstellen-Kategorie geordnet.

---

### 2.1 ARCHITECT: Architektur-Schwaechen

**Ziel:** Coupling-Probleme, Circular Dependencies, tote Code-Pfade, God-Module.

#### Query A1: Circular Dependencies finden
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (a)-[:CodeRelation {type: 'IMPORTS'}]->(b)-[:CodeRelation {type: 'IMPORTS'}]->(a) WHERE a <> b RETURN a.name, a.filePath, b.name, b.filePath"
})
```
> Findet Import-Zyklen zwischen Modulen. Jeder Zyklus ist ein Architektur-Smell.

#### Query A2: God-Module identifizieren (Symbole mit zu vielen Callern)
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(target) WITH target, COUNT(DISTINCT caller) AS callerCount WHERE callerCount > 8 RETURN target.name, target.filePath, callerCount ORDER BY callerCount DESC LIMIT 15"
})
```
> Symbole mit >8 Callern sind potenzielle God-Funktionen die aufgespalten werden sollten.

#### Query A3: Verwaiste Module (Symbole ohne Caller, kein Export)
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (f:Function) WHERE NOT EXISTS { MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f) } AND NOT f.filePath CONTAINS 'test' AND NOT f.filePath CONTAINS '__tests__' RETURN f.name, f.filePath ORDER BY f.filePath LIMIT 30"
})
```
> Toter Code der nie aufgerufen wird. Kandidaten fuer Entfernung oder Warnung.

#### Query A4: Cross-Module-Coupling zwischen semantic und core
```
gitnexus_impact({
  target: "endpoint-generator.ts",
  direction: "upstream",
  repo: "Balage  AINW",
  maxDepth: 3
})
```
> Wer haengt alles von endpoint-generator ab? Ist das Coupling gesund?

#### Query A5: Pipeline-Vollstaendigkeit — Alle Execution Flows tracen
```
# Die wichtigsten Prozesse einzeln tracen:
READ gitnexus://repo/Balage  AINW/process/EndpointDetection
READ gitnexus://repo/Balage  AINW/process/SemanticAnalysis
READ gitnexus://repo/Balage  AINW/process/PostProcessing
```
> Verifiziert dass die Pipeline lueckenlos ist (ERR-011 war genau so ein Luecken-Problem).

#### Erwartetes Output:
- Liste aller Circular Dependencies mit Schweregrad
- Top-10 God-Module mit Refactoring-Empfehlung
- Toter Code der entfernt werden kann
- Coupling-Matrix der 18 Module

---

### 2.2 AI_ENGINEER: LLM-Pipeline-Ineffizienzen

**Ziel:** Prompt-Probleme, Post-Processing-Luecken, LLM-Varianz-Ursachen, Token-Verschwendung.

#### Query ML1: Gesamte LLM-Pipeline tracen
```
gitnexus_query({
  query: "LLM client prompt semantic endpoint classification",
  repo: "Balage  AINW",
  goal: "Verstehe den vollstaendigen LLM-Call-Pfad von Input bis Output",
  limit: 10
})
```
> Zeigt alle Execution Flows die LLM-Calls beinhalten.

#### Query ML2: Post-Processing-Pipeline — wer ruft was auf?
```
gitnexus_context({
  name: "runPostProcessing",
  repo: "Balage  AINW",
  include_content: true
})
```
> 360-Grad-View: Wird runPostProcessing wirklich ueberall aufgerufen wo es soll?

#### Query ML3: Alle Post-Processing-Schritte und ihre Caller
```
gitnexus_context({name: "applyTypeCorrections", repo: "Balage  AINW"})
gitnexus_context({name: "applyConfidencePenalties", repo: "Balage  AINW"})
gitnexus_context({name: "applySiteSpecificCorrections", repo: "Balage  AINW"})
gitnexus_context({name: "deduplicateEndpoints", repo: "Balage  AINW"})
gitnexus_context({name: "applyGapCutoff", repo: "Balage  AINW"})
```
> Verifiziert dass ALLE 5 Post-Processing-Schritte tatsaechlich verdrahtet sind.
> ERR-011 hat gezeigt dass applySiteSpecificCorrections vorher toter Code war.

#### Query ML4: Prompt-Datei analysieren — wer konsumiert sie?
```
gitnexus_impact({
  target: "prompts.ts",
  direction: "upstream",
  repo: "Balage  AINW",
  maxDepth: 2
})
```
> Welche Pfade nutzen die Prompts? Gibt es Pfade die die Prompts umgehen?

#### Query ML5: Multi-Run-Voter — Blast Radius und Abhaengigkeiten
```
gitnexus_context({
  name: "multi-run-voter.ts",
  repo: "Balage  AINW",
  include_content: true
})

gitnexus_impact({
  target: "multiRunVote",
  direction: "downstream",
  repo: "Balage  AINW"
})
```
> Versteht wie der Voting-Mechanismus funktioniert und wovon er abhaengt.
> Wichtig weil Single-Run-Varianz +-4pp ist — der Voter ist der Stabilisator.

#### Query ML6: Cached LLM Client — Caching-Strategie
```
gitnexus_context({
  name: "CachedLLMClient",
  repo: "Balage  AINW",
  include_content: true
})
```
> Wie funktioniert das LLM-Caching? Cache-Invalidierung? Token-Kosten-Reduktion?

#### Erwartetes Output:
- Vollstaendige LLM-Pipeline-Karte (Input -> Parsing -> LLM -> Post-Processing -> Output)
- Liste aller Post-Processing-Schritte mit Status (verdrahtet / nicht verdrahtet / teilweise)
- Token-Kosten-Schaetzung pro Analyse-Call
- Varianz-Ursachen-Analyse (wo entsteht die +-4pp Schwankung?)

---

### 2.3 ENGINEER: Code-Qualitaet und Performance

**Ziel:** Error-Handling-Luecken, Performance-Bottlenecks, Code-Duplikation, API-Design-Probleme.

#### Query E1: Error-Handling-Abdeckung — wo fehlen try/catch?
```
gitnexus_query({
  query: "error handling throw catch exception",
  repo: "Balage  AINW",
  limit: 10
})
```
> Findet alle Error-Handling-Flows. Vergleich mit den tatsaechlichen throw-Sites.

#### Query E2: Alle errors.ts analysieren — ist die Error-Hierarchie konsistent?
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (f:File) WHERE f.name ENDS WITH 'errors.ts' MATCH (f)-[:CodeRelation {type: 'DEFINES'}]->(s) RETURN f.filePath, s.name ORDER BY f.filePath"
})
```
> Jedes Modul hat eine errors.ts — sind die Error-Klassen konsistent aufgebaut?

#### Query E3: DOM-Parser-Pipeline — Performance-kritischer Pfad
```
gitnexus_context({
  name: "dom-parser.ts",
  repo: "Balage  AINW",
  include_content: true
})

gitnexus_context({
  name: "ui-segmenter.ts",
  repo: "Balage  AINW"
})
```
> DOM-Parsing ist der erste Schritt und bestimmt die Datenqualitaet fuer alles danach.

#### Query E4: Hot-Paths finden — welche Funktionen werden am meisten aufgerufen?
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(target) WITH target, COUNT(caller) AS calls WHERE calls > 5 RETURN target.name, target.filePath, calls ORDER BY calls DESC LIMIT 20"
})
```
> Die meistgerufenen Funktionen sind die besten Kandidaten fuer Performance-Optimierung.

#### Query E5: Adapter-Schicht — ist sie vollstaendig?
```
gitnexus_query({
  query: "adapter configuration schema validation",
  repo: "Balage  AINW",
  goal: "Verstehe die Adapter-Architektur fuer verschiedene Browser-Agent-Frameworks",
  limit: 5
})
```
> BALAGE soll als Bridge funktionieren. Ist die Adapter-Schicht vollstaendig?

#### Query E6: API-Routes — Blast Radius bei Aenderungen
```
gitnexus_impact({
  target: "endpoints.ts",
  direction: "upstream",
  repo: "Balage  AINW",
  maxDepth: 2
})

gitnexus_impact({
  target: "workflows.ts",
  direction: "upstream",
  repo: "Balage  AINW",
  maxDepth: 2
})
```
> Wer nutzt die API-Routes? Wie stabil ist die API-Flaeche?

#### Erwartetes Output:
- Error-Handling-Luecken-Report (Module ohne ausreichende Error-Boundaries)
- Performance-Hotspot-Liste (Top-10 meistgerufene Funktionen)
- Code-Duplikations-Kandidaten
- API-Stabilitaets-Assessment

---

### 2.4 SECURITY: Sicherheitsanalyse

**Ziel:** API-Key-Handling, Input-Validation-Luecken, XSS/Injection-Risiken, PII-Leaks.

#### Query S1: Alle Security-relevanten Symbole und ihre Caller
```
gitnexus_query({
  query: "credential guard injection sanitizer validator",
  repo: "Balage  AINW",
  limit: 10
})
```
> Uebersicht aller Security-Module und wie sie eingebunden sind.

#### Query S2: Credential-Guard — wird er ueberall verwendet?
```
gitnexus_context({
  name: "credential-guard.ts",
  repo: "Balage  AINW",
  include_content: true
})

gitnexus_impact({
  target: "CredentialGuard",
  direction: "upstream",
  repo: "Balage  AINW",
  maxDepth: 2
})
```
> Kritisch: Wird der Credential-Guard an ALLEN API-Grenzen eingesetzt?
> Oder gibt es Pfade die ihn umgehen?

#### Query S3: Input-Sanitizer — Abdeckung
```
gitnexus_context({
  name: "input-sanitizer.ts",
  repo: "Balage  AINW",
  include_content: true
})

gitnexus_impact({
  target: "InputSanitizer",
  direction: "upstream",
  repo: "Balage  AINW"
})
```
> Wo wird User-Input entgegengenommen und wird er IMMER sanitized?

#### Query S4: Injection-Detector — Coverage-Pruefung
```
gitnexus_context({
  name: "injection-detector.ts",
  repo: "Balage  AINW",
  include_content: true
})
```
> Welche Injection-Typen werden abgedeckt? Fehlt etwas (z.B. Prompt-Injection)?

#### Query S5: PII-Filter — wo wird er eingesetzt?
```
gitnexus_context({
  name: "pii-filter.ts",
  repo: "Balage  AINW",
  include_content: true
})

gitnexus_impact({
  target: "pii-filter.ts",
  direction: "upstream",
  repo: "Balage  AINW"
})
```
> DSGVO-kritisch: Werden personenbezogene Daten aus DOM-Inhalten gefiltert
> bevor sie an LLM-APIs gesendet werden?

#### Query S6: Rate-Limiter — ist er an allen Eingaengen?
```
gitnexus_context({
  name: "rate-limiter.ts",
  repo: "Balage  AINW"
})

gitnexus_impact({
  target: "RateLimiter",
  direction: "upstream",
  repo: "Balage  AINW"
})
```
> Gibt es API-Endpunkte oder WebSocket-Pfade OHNE Rate-Limiting?

#### Query S7: CSP-Analyzer und Action-Validator
```
gitnexus_context({name: "csp-analyzer.ts", repo: "Balage  AINW"})
gitnexus_context({name: "action-validator.ts", repo: "Balage  AINW"})
```
> Werden vorgeschlagene Browser-Actions validiert bevor sie ausgefuehrt werden?

#### Erwartetes Output:
- Security-Boundary-Map: Alle Eingaenge und ob sie geschuetzt sind
- Ungescuetzte Pfade (Credential-Guard/Sanitizer/Rate-Limiter umgangen)
- PII-Leak-Risiken (DOM-Content -> LLM ohne PII-Filter)
- Prompt-Injection-Risiko-Assessment

---

### 2.5 QA: Test-Coverage und Regressions-Risiken

**Ziel:** Untestete Execution Flows, fehlende Edge-Case-Tests, Regressions-Risiken.

#### Query Q1: Alle Execution Flows auflisten und gegen Test-Files matchen
```
# Schritt 1: Alle Prozesse laden
READ gitnexus://repo/Balage  AINW/processes

# Schritt 2: Fuer jeden kritischen Prozess pruefen ob Tests existieren
gitnexus_query({
  query: "test semantic endpoint detection",
  repo: "Balage  AINW",
  limit: 10
})

gitnexus_query({
  query: "test post-processing benchmark",
  repo: "Balage  AINW",
  limit: 10
})
```
> Matcht Execution Flows mit vorhandenen Tests.

#### Query Q2: Module OHNE Tests identifizieren
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (c:Community) WHERE c.size > 3 AND NOT EXISTS { MATCH (f:File)-[:CodeRelation {type: 'MEMBER_OF'}]->(c) WHERE f.filePath CONTAINS 'test' } RETURN c.heuristicLabel, c.size ORDER BY c.size DESC"
})
```
> Welche funktionalen Cluster haben KEINE zugehoerigen Test-Dateien?

#### Query Q3: Kritische Pfade ohne Tests
```
# Fuer jeden dieser kritischen Pfade: Hat er Tests?
gitnexus_impact({
  target: "runPostProcessing",
  direction: "upstream",
  repo: "Balage  AINW",
  includeTests: true,
  maxDepth: 2
})

gitnexus_impact({
  target: "endpoint-generator.ts",
  direction: "upstream",
  repo: "Balage  AINW",
  includeTests: true
})
```
> Zeigt welche Caller der kritischen Funktionen durch Tests abgedeckt sind.

#### Query Q4: Benchmark-Flow vollstaendig tracen
```
gitnexus_query({
  query: "benchmark runner metrics evaluation F1",
  repo: "Balage  AINW",
  goal: "Verstehe den vollstaendigen Benchmark-Flow",
  limit: 5
})

gitnexus_context({
  name: "benchmark-runner",
  repo: "Balage  AINW",
  include_content: true
})
```
> Der Benchmark ist unser Quality-Gate. Ist er selbst robust genug?

#### Query Q5: Regressions-Hotspots — was bricht am leichtesten?
```
gitnexus_impact({
  target: "analyze.ts",
  direction: "upstream",
  repo: "Balage  AINW",
  maxDepth: 3
})
```
> analyze.ts ist der Core-Entry-Point. Blast Radius = Regressions-Risiko.

#### Erwartetes Output:
- Coverage-Map: Execution-Flow -> Test-Datei -> Coverage-Status
- Liste untesteter kritischer Pfade (Prio: Post-Processing, LLM-Pipeline, Benchmark)
- Regressions-Risiko-Matrix (Aenderung an X bricht Y)
- Test-Strategie-Empfehlung fuer Hold-Out-Set

---

### 2.6 PLATFORM: Build-Pipeline und Deployment

**Ziel:** Bundle-Size, Build-Konfiguration, Dependency-Health, CI-Pipeline-Luecken.

#### Query P1: Build-Konfiguration und Entry-Points
```
gitnexus_context({
  name: "index.ts",
  repo: "Balage  AINW",
  file_path: "src/index.ts"
})
```
> Was exportiert das Package? Sind alle Exports sauber definiert?

#### Query P2: Dependency-Graph — externe Abhaengigkeiten
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (f:File)-[:CodeRelation {type: 'IMPORTS'}]->(ext) WHERE NOT ext.filePath STARTS WITH 'src/' AND NOT ext.filePath CONTAINS 'node_modules' RETURN ext.name, COUNT(f) AS importers ORDER BY importers DESC LIMIT 20"
})
```
> Welche externen Dependencies werden wie haeufig importiert?

#### Query P3: MCP-Server — isoliert oder gekoppelt?
```
gitnexus_context({
  name: "server.ts",
  repo: "Balage  AINW",
  file_path: "src/mcp/server.ts",
  include_content: true
})

gitnexus_impact({
  target: "server.ts",
  direction: "downstream",
  repo: "Balage  AINW"
})
```
> Der MCP-Server ist ein separater Entry-Point. Ist er sauber vom Core entkoppelt?

#### Query P4: Konfigurationsmanagement
```
gitnexus_query({
  query: "configuration schema adapter environment",
  repo: "Balage  AINW",
  goal: "Verstehe wie Konfiguration geladen und validiert wird",
  limit: 5
})
```
> Gibt es eine einheitliche Config-Strategie oder wildwuchs?

#### Query P5: Benchmark-Infrastruktur — reproduzierbar?
```
gitnexus_query({
  query: "benchmark runner fixtures test sites",
  repo: "Balage  AINW",
  limit: 5
})
```
> Ist der Benchmark reproduzierbar? Sind Fixtures versioniert?

#### Erwartetes Output:
- Dependency-Health-Report (veraltete/unsichere Deps)
- Bundle-Size-Analyse und Tree-Shaking-Potential
- MCP-Server Entkopplungs-Assessment
- CI-Pipeline-Empfehlung (was fehlt?)

---

### 2.7 STRATEGIST: Kosten-Optimierung und Feature-Prioritaet

**Ziel:** API-Kosten pro Analyse, Komplexitaet-vs-Wert-Analyse, Build-vs-Buy-Entscheidungen.

#### Query ST1: LLM-Call-Pfade zaehlen — wie viele API-Calls pro Analyse?
```
gitnexus_query({
  query: "LLM API call OpenAI token cost",
  repo: "Balage  AINW",
  limit: 10
})

gitnexus_context({
  name: "llm-client.ts",
  repo: "Balage  AINW",
  include_content: true
})

gitnexus_context({
  name: "fallback-llm-client.ts",
  repo: "Balage  AINW",
  include_content: true
})
```
> Wie viele LLM-Calls macht eine Analyse? Was kostet das?

#### Query ST2: Modul-Komplexitaet vs. F1-Impact
```cypher
gitnexus_cypher({
  repo: "Balage  AINW",
  query: "MATCH (c:Community) RETURN c.heuristicLabel, c.size ORDER BY c.size DESC LIMIT 20"
})
```
> Groesste Module = meiste Wartungskosten. Korreliert Groesse mit F1-Impact?

#### Query ST3: Feature-Prioritaet — was hat den groessten Blast Radius?
```
# Fuer jedes geplante Feature den Blast Radius pruefen:
gitnexus_impact({target: "type-corrector.ts", direction: "upstream", repo: "Balage  AINW"})
gitnexus_impact({target: "multi-run-voter.ts", direction: "upstream", repo: "Balage  AINW"})
gitnexus_impact({target: "deduplicator.ts", direction: "upstream", repo: "Balage  AINW"})
```
> Features mit kleinem Blast Radius sind sicherer zu shippen.

#### Query ST4: Adapter-Strategie — Integration-Aufwand
```
gitnexus_query({
  query: "adapter browser-use stagehand playwright",
  repo: "Balage  AINW",
  goal: "Verstehe den Aufwand fuer neue Browser-Agent-Integrationen",
  limit: 5
})
```
> Wie aufwaendig ist eine neue Integration? Gibt es ein Pattern oder jedes Mal Neuanfang?

#### Erwartetes Output:
- Kosten-pro-Analyse-Kalkulation (LLM-Tokens + Compute)
- Modul-Komplexitaet-Matrix mit Wartungskosten-Schaetzung
- Feature-Prioritaets-Ranking basierend auf (F1-Impact / Blast-Radius)
- Integration-Aufwand-Schaetzung fuer browser-use, Stagehand, AgentQL

---

## 3. Phase 3: Cross-Agent Findings (1 Stunde, moderiert durch COORDINATOR)

### 3.1 Findings-Zusammenfuehrung

Jeder Agent liefert seine Findings in einem standardisierten Format:

```markdown
### [AGENT-NAME] Finding [Nummer]
**Kategorie:** [Architecture | Performance | Security | Quality | Cost]
**Schweregrad:** CRITICAL | HIGH | MEDIUM | LOW
**Betroffene Symbole:** [Liste mit Datei-Pfaden]
**Betroffene Execution Flows:** [Prozess-Namen aus GitNexus]
**Blast Radius:** [d=1: X, d=2: Y, d=3: Z]
**Empfehlung:** [Konkreter Fix oder Refactoring-Vorschlag]
**Geschaetzter Aufwand:** [Stunden]
**F1-Impact:** [Geschaetzte Verbesserung wenn zutreffend]
```

### 3.2 Cross-Reference-Matrix

Der COORDINATOR erstellt eine Matrix die zeigt wo Findings mehrerer Agents
das gleiche Symbol oder den gleichen Flow betreffen:

```
Symbol/Flow          | ARCH | AI_ENG | ENG | SEC | QA | PLAT | STRAT
---------------------------------------------------------------------
endpoint-generator   |  X   |   X    |  X  |     |  X |      |   X
runPostProcessing    |  X   |   X    |     |     |  X |      |
llm-client           |      |   X    |  X  |  X  |    |      |   X
credential-guard     |      |        |     |  X  |  X |      |
benchmark-runner     |      |   X    |     |     |  X |   X  |   X
dom-parser           |  X   |        |  X  |  X  |    |      |
```

> Symbole mit Findings von 3+ Agents sind die hoechstpriorisierten Fixes.

### 3.3 Konflikt-Resolution

Erwartete Konflikte und vorbereitete Resolution:

| Konflikt | Beteiligte | Resolution-Regel |
|----------|-----------|-----------------|
| "Refactoring verzoegert F1-Arbeit" | ARCHITECT vs AI_ENGINEER | F1 > Architektur-Sauberkeit (aktuell). Nur refactorn wenn es F1 blockt. |
| "Security erfordert PII-Filter vor LLM" | SECURITY vs AI_ENGINEER | Security > Performance. Aber: Aufwand schaetzen lassen, ggf. Phase 2. |
| "Tests dauern zu lang" | QA vs ENGINEER | Priorisiere Tests fuer Post-Processing und Benchmark — nicht alles auf einmal. |
| "Bundle-Size-Optimierung" | PLATFORM vs ENGINEER | Erst nach npm publish. Optimierung ist Phase-2-Thema. |

### 3.4 Priorisierte Action-Items

Die Findings werden in 3 Buckets sortiert:

**Bucket 1 — FIX NOW (blockt F1 oder ist Security-Risk):**
- Alles was SECURITY als CRITICAL/HIGH markiert
- Alles was AI_ENGINEER als direkte F1-Verbesserung identifiziert
- Post-Processing-Luecken (ERR-011 hat gezeigt wie teuer diese sind)

**Bucket 2 — FIX BEFORE SHIP (blockt npm publish oder Integration):**
- PLATFORM-Findings zu Build/Bundle
- ENGINEER-Findings zu API-Stabilitaet
- QA-Findings zu fehlenden Tests fuer kritische Pfade

**Bucket 3 — FIX LATER (Technical Debt, nicht dringend):**
- ARCHITECT-Findings zu Coupling und Code-Struktur
- STRATEGIST-Empfehlungen zu Kosten-Optimierung
- QA-Findings zu Edge-Case-Tests

---

## 4. GitNexus-Query-Referenz nach Agent (Schnelluebersicht)

### ARCHITECT (5 Queries)
| ID | Tool | Ziel |
|----|------|------|
| A1 | cypher | Circular Dependencies (IMPORTS-Zyklen) |
| A2 | cypher | God-Module (>8 Caller) |
| A3 | cypher | Verwaiste Funktionen (0 Caller, kein Test) |
| A4 | impact | endpoint-generator.ts upstream Blast Radius |
| A5 | process-resources | Pipeline-Vollstaendigkeit tracen |

### AI_ENGINEER (6 Queries)
| ID | Tool | Ziel |
|----|------|------|
| ML1 | query | LLM-Pipeline Execution Flows |
| ML2 | context | runPostProcessing 360-Grad-View |
| ML3 | context (5x) | Alle Post-Processing-Schritte einzeln pruefen |
| ML4 | impact | prompts.ts upstream — wer nutzt die Prompts? |
| ML5 | context+impact | Multi-Run-Voter Abhaengigkeiten |
| ML6 | context | CachedLLMClient Caching-Strategie |

### ENGINEER (6 Queries)
| ID | Tool | Ziel |
|----|------|------|
| E1 | query | Error-Handling Execution Flows |
| E2 | cypher | Alle errors.ts und ihre Definitionen |
| E3 | context (2x) | DOM-Parser + UI-Segmenter Tiefenanalyse |
| E4 | cypher | Hot-Paths (meistgerufene Funktionen) |
| E5 | query | Adapter-Architektur Vollstaendigkeit |
| E6 | impact (2x) | API-Routes Blast Radius |

### SECURITY (7 Queries)
| ID | Tool | Ziel |
|----|------|------|
| S1 | query | Alle Security-Module und Einbindung |
| S2 | context+impact | Credential-Guard Abdeckung |
| S3 | context+impact | Input-Sanitizer Abdeckung |
| S4 | context | Injection-Detector Coverage |
| S5 | context+impact | PII-Filter Einsatzorte |
| S6 | context+impact | Rate-Limiter an allen Eingaengen? |
| S7 | context (2x) | CSP-Analyzer und Action-Validator |

### QA (5 Queries)
| ID | Tool | Ziel |
|----|------|------|
| Q1 | processes+query | Execution Flows vs. Test-Dateien matchen |
| Q2 | cypher | Module OHNE Tests |
| Q3 | impact (2x) | Kritische Pfade mit includeTests=true |
| Q4 | query+context | Benchmark-Flow Robustheit |
| Q5 | impact | analyze.ts Regressions-Blast-Radius |

### PLATFORM (5 Queries)
| ID | Tool | Ziel |
|----|------|------|
| P1 | context | src/index.ts Export-Analyse |
| P2 | cypher | Externe Dependencies und Importers |
| P3 | context+impact | MCP-Server Entkopplung |
| P4 | query | Konfigurationsmanagement |
| P5 | query | Benchmark-Infrastruktur Reproduzierbarkeit |

### STRATEGIST (4 Queries)
| ID | Tool | Ziel |
|----|------|------|
| ST1 | query+context (2x) | LLM-Call-Kosten pro Analyse |
| ST2 | cypher | Modul-Komplexitaet (Cluster-Groessen) |
| ST3 | impact (3x) | Feature-Blast-Radius fuer Priorisierung |
| ST4 | query | Adapter/Integration-Aufwand |

---

## 5. Zeitplan und Abhaengigkeiten

```
ZEIT      | AKTIVITAET
----------+-----------------------------------------------------------
0:00      | ALLE: Phase 1 — GitNexus Resources lesen (parallel)
0:30      | ARCHITECT + AI_ENGINEER: Phase 2 starten (parallel)
0:30      | SECURITY + ENGINEER: Phase 2 starten (parallel)
0:30      | QA + PLATFORM + STRATEGIST: Phase 2 starten (parallel)
          |
          | --- Alle 7 Agents arbeiten parallel ---
          |
2:30      | ALLE: Findings im Standard-Format abliefern
2:30      | COORDINATOR: Cross-Reference-Matrix erstellen
3:00      | COORDINATOR: Konflikt-Resolution, Priorisierung
3:30      | ARCHITECT: Finales Architektur-Urteil basierend auf allen Findings
3:30      | STRATEGIST: Kosten-Impact-Assessment
4:00      | COORDINATOR: Priorisierte Action-Item-Liste fertig
```

### Abhaengigkeiten zwischen Agents

```
Phase 2 hat KEINE Abhaengigkeiten — alle Agents koennen parallel arbeiten.
Phase 3 hat folgende:
  COORDINATOR ← wartet auf alle 7 Agent-Reports
  ARCHITECT-Urteil ← wartet auf SECURITY + QA Findings
  STRATEGIST-Assessment ← wartet auf AI_ENGINEER + PLATFORM Findings
```

---

## 6. Erfolgs-Kriterien

Die Analyse ist erfolgreich wenn:

- [ ] Alle 218 Clusters sind einem Agent zur Pruefung zugewiesen
- [ ] Alle 210 Execution Flows sind gegen Test-Dateien gemappt (QA)
- [ ] Jeder Agent hat mindestens 3 Findings mit Schweregrad abgeliefert
- [ ] Die Cross-Reference-Matrix identifiziert mindestens 3 Symbole mit Multi-Agent-Findings
- [ ] Es gibt eine priorisierte Action-Item-Liste mit klaren Owners und geschaetztem Aufwand
- [ ] Die Action-Items sind in Bucket 1/2/3 sortiert und in den Sprint-Plan integrierbar
- [ ] Kein Finding widerspricht einem anderen ohne dokumentierte Resolution

---

*Plan erstellt: 2026-03-28 | COORDINATOR*
*Basiert auf: GitNexus Index (2610 Nodes, 6455 Edges, 218 Clusters, 210 Flows)*
*Codebase-Snapshot: 200 TS-Dateien, 73 Tests, 18 Module*
