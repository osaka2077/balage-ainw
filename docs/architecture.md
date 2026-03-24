# Architecture Overview

BALAGE is a **Semantic Verification Layer for Browser Agents**. It ships as two packages:

- **balage-core** (`packages/core`) — npm Library fuer DOM-Analyse, Framework-Erkennung und Endpoint-Inferenz
- **balage-mcp** (`packages/mcp`) — MCP Server, der balage-core ueber das Model Context Protocol exponiert

## Package-Architektur

```
packages/core/          npm Package (balage-core)
  tsup.config.ts        Baut aus ../../src/core/index.ts
  dist/                 ESM + CJS Bundles

packages/mcp/           npm Package (balage-mcp)
  src/index.ts          MCP Server — nutzt balage-core intern
  dist/                 ESM Bundle
```

## Import-Graph (npm Package)

Das npm-Package `balage-core` baut aus `src/core/index.ts` und zieht diese Module ein:

```
src/core/               Einstiegspunkt + Public API
  ├── analyze.ts        analyzeFromHTML() — Haupt-Funktion
  ├── html-to-dom.ts    htmlToDomNode() — HTML zu DomNode-Baum
  ├── detect-framework.ts  detectFramework() — React/Vue/Angular/etc. erkennen
  ├── infer-selector.ts    inferSelector() — CSS-Selektor generieren
  └── types.ts          Error-Klassen + Type-Definitionen

src/parser/             Parsing Engine (Layer 2)
  ├── pruner.ts         DOM-Baum bereinigen
  ├── aria-parser.ts    Accessibility-Tree extrahieren
  └── ui-segmenter.ts   Seite in UI-Regionen aufteilen

src/semantic/           Semantic Engine (Layer 3)
  └── types.ts          EndpointCandidate Type

src/security/           Security Hardening
  ├── input-sanitizer.ts   Input bereinigen
  ├── injection-detector.ts  Injection-Angriffe erkennen
  └── credential-guard.ts   Credentials schuetzen

src/schemas/            Typ-Definitionen (aufgespalten aus shared_interfaces.ts)
  ├── dom.ts            DomNode, AccessibilityNode
  ├── segment.ts        UISegment, SegmentType
  ├── endpoint.ts       Endpoint, SemanticFingerprint, Evidence
  └── orchestration.ts  Workflow, SubAgent, AuditEntry

shared_interfaces.ts    Re-Export-Proxy → src/schemas/index.ts
```

## Was ist im npm-Package, was nicht?

**Im Bundle** (via tsup Tree-Shaking):

| Modul | Funktion |
|-------|----------|
| `src/core/` | Public API: `analyzeFromHTML`, `detectFramework`, `htmlToDomNode`, `inferSelector` |
| `src/parser/` | DOM-Pruning, ARIA-Parsing, UI-Segmentierung |
| `src/semantic/types` | EndpointCandidate-Typ |
| `src/security/` | Input-Sanitizer, Injection-Detector, Credential-Guard |
| `src/schemas/` | Alle geteilten Typ-Definitionen |

**Nicht im Bundle** (Legacy/SaaS-Module, nicht von `src/core/` importiert):

| Modul | Beschreibung |
|-------|-------------|
| `src/adapter/` | Browser Adapter (Playwright/CDP) |
| `src/orchestrator/` | Workflow-Orchestrierung |
| `src/risk/` | Risk Gates + Confidence Engine |
| `src/agents/` | Sub-Agents (Navigator, FormFiller, etc.) |
| `src/fingerprint/` | Fingerprint Engine |
| `src/confidence/` | Confidence Scoring |
| `src/observability/` | Logging, Tracing, Audit |
| `src/api/` | REST API Server |
| `src/config/` | Konfigurationsmanagement |

Diese Module koennten spaeter reaktiviert werden, sind aber aktuell nicht Teil des npm-Packages.

## Design-Entscheidungen

1. **Semantic over Visual** — DOM + ARIA-Tree statt Screenshots. Erkennt hidden fields, ARIA-Rollen, Seitenstruktur.
2. **Evidence-Based Confidence** — Jede Endpoint-Interpretation ist durch eine Evidence-Chain belegt.
3. **Default-Deny Risk Gates** — Aktionen werden blockiert, bis genuegend Evidenz vorliegt.
4. **Library-First** — Kein SaaS, kein Server noetig. `npm install balage-core` und loslegen.
