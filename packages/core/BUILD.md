# Building balage-core

## Quick Start

```bash
cd packages/core
npx tsup          # Builds dist/index.js (ESM) + dist/index.cjs (CJS)
```

Verify the build:

```bash
node -e "const m = require('./dist/index.cjs'); console.log(Object.keys(m).sort())"
# Expected: BalageError, BalageInputError, BalageLLMError, VERSION, analyzeFromHTML, detectFramework, htmlToDomNode, inferSelector
```

## Wie der Build funktioniert

### Einstiegspunkt

tsup baut aus `src/core/index.ts` im Repo-Root — **nicht** aus `packages/core/src/`.
`packages/core/` enthaelt nur die Build-Konfiguration, Metadaten und das gebaute `dist/`.

Die tsup-Config zeigt das explizit:

```ts
// packages/core/tsup.config.ts
entry: ["../../src/core/index.ts"],   // <-- Repo-Root src/core/
```

### Import-Graph

```
src/core/index.ts          (Einstiegspunkt — exportiert Public API)
  ├── src/core/analyze.ts  (Haupt-Analyse-Funktion)
  │     ├── src/core/html-to-dom.ts      (HTML → DomNode)
  │     ├── src/core/detect-framework.ts (Framework-Erkennung)
  │     ├── src/core/infer-selector.ts   (CSS-Selektor-Generierung)
  │     ├── src/parser/index.ts          (pruneDom, parseAria, segmentUI)
  │     ├── src/semantic/types.ts        (EndpointCandidate Type)
  │     └── shared_interfaces.ts         (DomNode, UISegment via Re-Export)
  ├── src/core/types.ts    (Error-Klassen + Typen)
  │     └── shared_interfaces.ts         (Re-Export aus src/schemas/)
  └── src/core/infer-selector.ts
```

### shared_interfaces.ts — Warum ein Re-Export-Proxy?

`shared_interfaces.ts` im Repo-Root war historisch DIE zentrale Typ-Datei (2000+ Zeilen).
In Wave 3 wurden die Typen in `src/schemas/` aufgespalten:

- `src/schemas/dom.ts` — DomNode, AccessibilityNode
- `src/schemas/segment.ts` — UISegment, SegmentType
- `src/schemas/endpoint.ts` — Endpoint, SemanticFingerprint, Evidence
- `src/schemas/orchestration.ts` — Workflow, SubAgent, AuditEntry

`shared_interfaces.ts` exportiert jetzt nur noch `export * from "./src/schemas/index.js"`.
Das stellt sicher, dass alle bestehenden Imports weiterhin funktionieren.

### Bundle-Formate

| Format | Datei | Verwendung |
|--------|-------|-----------|
| ESM | `dist/index.js` | `import { analyzeFromHTML } from "balage-core"` |
| CJS | `dist/index.cjs` | `const { analyzeFromHTML } = require("balage-core")` |
| Sourcemaps | `dist/index.js.map`, `dist/index.cjs.map` | Debugging |

DTS (TypeScript-Deklarationen) liegt handgeschrieben in `dist/index.d.ts`, weil tsup DTS-Generierung
mit dem Monorepo-rootDir-Setup nicht funktioniert.

### Build testen

```bash
# 1. TypeCheck (gesamtes Repo)
npx tsc --noEmit

# 2. Package bauen
cd packages/core && npx tsup

# 3. Exports pruefen
cd ../.. && node -e "const m = require('./packages/core/dist/index.cjs'); console.log(Object.keys(m).sort())"

# 4. Unit Tests (607 Tests)
npx vitest run --exclude='tests/real-world/**'
```
