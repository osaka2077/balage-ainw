# Sprint-Plan Tag 27-35: Development Sprint

> Erstellt: 2026-03-24 | Methodik: ai-parallel-dev | Team: COORDINATOR + AI_ENGINEER + QA + ENGINEER

---

## Uebersicht

```
Wave 1 (1h, parallel):    ESLint Cleanup + Wikipedia Bug Fix
Wave 2 (3-5h, fokussiert): F1 Score von ~50% auf ~70%
Wave 3 (4-8h, parallel):  verify() Feature Implementation
```

---

## WAVE 1: Code-Hygiene (2 Terminals parallel, ~1h)

### Terminal A: Wikipedia-Bug Fix

**Exklusiver Pfad:** `tests/real-world/wikipedia.test.ts`

```
Du bist der ENGINEER. Fixe den Wikipedia-Test-Bug.

BUG: tests/real-world/wikipedia.test.ts Zeile 38:
  llmClient = createFallbackLLMClient({ envConfig });

createFallbackLLMClient() ist async (gibt Promise zurueck).
Ohne await ist llmClient ein Promise-Objekt, daher schlaegt
llmClient.summary() auf Zeile 197 fehl.

FIX: Aendere Zeile 38 zu:
  llmClient = await createFallbackLLMClient({ envConfig });

VALIDIERUNG:
  npx tsc --noEmit

Aendere NUR tests/real-world/wikipedia.test.ts.
```

### Terminal B: ESLint Cleanup

**Exklusive Pfade:** Alle Dateien mit ESLint Warnings (37 Dateien)

```
Du bist der ENGINEER. Raeume alle ESLint Warnings auf.

Fuehre `npm run lint` aus um alle Warnings zu sehen.

STRATEGIE:
1. Unused IMPORTS: Import-Zeile entfernen oder aus destructuring entfernen
2. Unused VARIABLES in Tests: Entfernen oder mit _ prefixen
3. Unused FUNCTIONS/CONSTANTS: Loeschen (STRUCTURAL_TAGS, SEARCH_PATTERNS
   in dom-pruner.ts und endpoint-classifier.ts, convertChecked in dom-extractor.ts,
   formatLabels in metrics-collector.ts, ALL_EVIDENCE_TYPES in evidence-quality.ts)
4. Unused PARAMETERS: _ prefix (parentTag -> _parentTag in html-to-dom.ts)

AUSNAHMEN (NICHT AENDERN):
- src/semantic/llm-client.ts: 2x `any` BEHALTEN (lazy-loaded SDKs benoetigen any)
  Stattdessen: // eslint-disable-next-line @typescript-eslint/no-explicit-any
- src/schemas/dom.ts: 2x `any` BEHALTEN (Zod recursive z.lazy() erfordert any)
  Stattdessen: // eslint-disable-next-line @typescript-eslint/no-explicit-any

ZIEL: < 5 Warnings nach Cleanup (die 4 any bleiben als eslint-disable)

VALIDIERUNG:
  npm run lint          # < 5 Warnings, 0 Errors
  npx vitest run --exclude='tests/real-world/**'  # 607 Tests gruen

Keine funktionalen Aenderungen. Nur Imports/Variablen entfernen.
```

### Merge-Gate Wave 1:
```bash
npx tsc --noEmit                                    # 0 Errors
npm run lint                                         # < 5 Warnings
npx vitest run --exclude='tests/real-world/**'       # 607 Tests
```

---

## WAVE 2: F1 Verbesserung (1-2 Terminals, ~3-5h)

### Root Cause (QA-Analyse):

3 systemische Probleme verursachen ~80% der Fehler:

1. **Navigation-Deduplizierung zu aggressiv** — "nur 1 pro Typ" killt Recall
   bei Sites mit 3-6 Nav-Bereichen (Header, Sidebar, Breadcrumbs, Footer)
   Betrifft: Trello, Shopify, Stripe, Wikipedia, Target

2. **checkout/commerce-Typ fehlt oder wird falsch zugeordnet**
   Add-to-Cart, Cart-Icons werden nicht erkannt
   Betrifft: Shopify, Target

3. **Settings/Dropdowns als search fehlklassifiziert**
   Font-Size, Theme-Toggle, Language-Selector sind kein Search
   Betrifft: Wikipedia, Shopify

### Terminal C: F1 Heuristik-Verbesserung

**Exklusive Pfade:**
- `src/semantic/endpoint-classifier.ts`
- `src/semantic/endpoint-generator.ts`
- `src/core/analyze.ts` (nur die Deduplizierungs-Logik)
- `tests/unit/endpoint-classifier.test.ts`

```
Du bist der AI_ENGINEER. Verbessere den F1-Score des Benchmark.

KONTEXT: Der Benchmark auf 20 Sites zeigt F1=66% (committed reference).
Die schwachen Sites (Trello 29%, Shopify 33%, Stripe 46%) haben
3 systemische Probleme:

PROBLEM 1: Navigation-Deduplizierung zu aggressiv
  Aktuell: Nur das beste Segment pro EndpointType wird behalten.
  Das bedeutet: Eine Seite mit Header-Nav, Sidebar-Nav, Breadcrumbs,
  Footer-Nav bekommt nur 1 navigation-Endpoint.

  FIX: In src/core/analyze.ts (oder wo die Deduplizierung passiert):
  Fuer den Typ "navigation" mehrere Endpoints zulassen wenn sie
  raeumlich getrennt sind (verschiedene UI-Segmente).
  Vorschlag: Max 4 navigation-Endpoints statt 1.

  VORSICHT: Lies den Code genau. Die Deduplizierung koennte in
  analyze.ts ODER in endpoint-generator.ts sein.

PROBLEM 2: Settings vs Search Fehlklassifizierung
  Dropdowns fuer Font-Size, Theme, Language werden als "search" erkannt.

  FIX: In src/semantic/endpoint-classifier.ts:
  Neue Heuristik: Wenn ein Element ein <select>, Radio-Group oder
  Toggle ist UND Text-Patterns wie "font", "theme", "dark mode",
  "appearance", "language", "sprache" enthaelt → Typ "settings"
  oder "form", NICHT "search".

PROBLEM 3: Commerce/Checkout nicht erkannt
  Add-to-Cart Buttons und Cart-Icons werden verpasst.

  FIX: In src/semantic/endpoint-classifier.ts:
  Neue Heuristik: Elemente mit Patterns "add to cart", "add to bag",
  "in den warenkorb", Cart-Icons (svg/img), href="/cart" → Typ "commerce".

FUER JEDEN FIX:
- Schreibe Unit-Tests in tests/unit/endpoint-classifier.test.ts
- Stelle sicher dass bestehende Tests nicht brechen
- Keine Regression der guten Sites (Google 91%, Typeform 83%, HN 80%)

VALIDIERUNG:
  npx vitest run --exclude='tests/real-world/**'  # Alle Tests gruen
  npm run lint                                     # Keine neuen Warnings
```

### Terminal D: Benchmark-Diagnose (parallel oder nach C)

**Exklusive Pfade:**
- `tests/real-world/fixtures/` (nur lesen/pruefen)
- `tests/real-world/ground-truth/`
- `tests/real-world/benchmark-runner.ts`

```
Du bist der QA ENGINEER. Diagnostiziere die F1=0.000 Sites.

9 Sites im Benchmark detektieren 0 Endpoints (F1=0.000):
gitlab-login, stackoverflow-main, zendesk-support, airbnb-main,
booking-main, ebay-de-main, zalando-de-main, amazon-de-main,
angular-material-demo

SCHRITT 1: Pruefe ob die HTML-Fixtures existieren und nicht-leer sind:
  ls -la tests/real-world/fixtures/*.html
  wc -l tests/real-world/fixtures/*.html

SCHRITT 2: Fuer 1 Beispiel (z.B. airbnb-main) den Pipeline-Durchlauf
nachvollziehen:
  - Lade die HTML-Fixture
  - Fuehre analyzeFromHTML(html) manuell aus
  - Logge: Wird HTML geparsed? Werden Segmente gefunden?
    Werden Candidates generiert? Wo bricht es ab?

SCHRITT 3: Entscheide pro Site:
  a) Fixture fehlt/leer → Erwartet, kein Code-Bug
  b) Fixture existiert aber Pipeline scheitert → Code-Bug, dokumentieren
  c) Fixture existiert, Endpoints erkannt aber nicht gematcht → Ground-Truth-Problem

Erstelle einen Report mit dem Befund pro Site.

Aendere KEINEN Code. Nur Analyse und Dokumentation.
```

### Merge-Gate Wave 2:
```bash
npx vitest run --exclude='tests/real-world/**'  # Alle Tests gruen
npm run lint                                     # < 5 Warnings
# Optional: Benchmark re-run wenn API-Key verfuegbar
```

---

## WAVE 3: verify() Feature (2-3 Terminals, ~4-8h)

### Vorbedingung: Wave 1 + 2 abgeschlossen und gemerged.

### API Design (aus AI_ENGINEER Analyse):

```typescript
// Signatur:
async function verify(
  snapshot: ActionSnapshot,  // DOM/URL vorher + nachher
  expectation: VerificationExpectation,  // Was erwartet wird
  options?: VerifyOptions,  // LLM, thresholds, audit
): Promise<VerificationResult>;

// Szenarien: login, form_submit, navigation, modal_open, modal_close, error
// Heuristic-first, LLM optional
// Browser-agnostisch (arbeitet auf HTML-Strings)
```

### Terminal E: verify() Core Implementation

**Exklusive Pfade (NEUE Dateien):**
- `src/core/verify.ts`
- `src/core/verify-types.ts`
- `src/core/verify-checks/dom-diff.ts`
- `src/core/verify-checks/url-change.ts`
- `src/core/verify-checks/network-check.ts`
- `src/core/verify-checks/cookie-check.ts`
- `src/core/verify-checks/custom-check.ts`
- `src/core/verify-strategies/login.ts`
- `src/core/verify-strategies/form-submit.ts`
- `src/core/verify-strategies/navigation.ts`
- `src/core/verify-strategies/modal.ts`
- `src/core/verify-strategies/error.ts`
- `src/core/verify-scoring.ts`
- `src/core/verify-audit.ts`

**Bestehende Dateien (NUR exports hinzufuegen):**
- `src/core/index.ts` (export { verify } hinzufuegen)
- `src/core/types.ts` (Verify-Types re-exportieren)

```
Du bist der ENGINEER. Implementiere das verify() Feature fuer balage-core.

KONTEXT: balage-core hat analyzeFromHTML() das sagt WAS auf einer Seite ist.
verify() sagt ob eine Aktion ERFOLGREICH war (DOM-Diff, URL-Change, etc.)

API DESIGN:

verify(snapshot, expectation, options?) → VerificationResult

snapshot = {
  before: { html, url, timestamp },
  after: { html, url, timestamp },
  networkRequests?: [{ url, method, status }],
  action: { type, selector, endpointType? }
}

expectation = { type: "login"|"form_submit"|"navigation"|"modal_open"|... }

result = {
  verdict: "verified"|"failed"|"inconclusive",
  confidence: 0.0-1.0,
  checks: [{ name, passed, confidence, evidence, source }],
  domDiff: { addedElements, removedElements, textChanges, significantChanges },
  timing: { totalMs }
}

ARCHITEKTUR:
1. verify.ts — Haupt-API, Input-Validation, Strategy-Dispatch
2. verify-types.ts — Alle TypeScript Types
3. verify-checks/ — Atomare Signal-Checks:
   - dom-diff.ts: HTML vorher/nachher vergleichen via htmlToDomNode()
     Noise-Filter: <script>, <style>, data-reactid ignorieren
     Relevanz: class-Changes mit "error"|"success", aria-*, display-Changes
   - url-change.ts: URL-Vergleich (same-page, navigation, redirect)
   - network-check.ts: POST-Requests, Status 4xx/5xx erkennen
   - cookie-check.ts: Neue Session-Cookies erkennen (nur Name, kein Wert!)
   - custom-check.ts: Selector-basierte Checks
4. verify-strategies/ — Szenario-spezifische Check-Kombination:
   - login.ts: URL-Change (0.30) + Cookie (0.25) + Welcome-Text (0.20)
               + Form-Gone (0.15) + Network-POST (0.10)
   - form-submit.ts: Network-POST (0.30) + Success-Text (0.25) +
                     URL-Change (0.20) + Form-Gone (0.15) + No-Error (0.10)
   - navigation.ts: URL-Change (0.50) + Content-Diff (0.25) +
                    New-Heading (0.15) + State-Event (0.10)
   - modal.ts: role="dialog" added (0.40) + display-Change (0.25) +
              Backdrop (0.15) + aria-modal (0.10) + URL-Stable (0.10)
   - error.ts: Error-Text (0.35) + Error-Class (0.20) + HTTP-4xx (0.25) +
              aria-live (0.10) + URL-Stable (0.10)
5. verify-scoring.ts — Gewichtete Confidence-Aggregation

V1 SCOPE: Nur heuristic mode (kein LLM). LLM kommt in V1.1.

WICHTIG:
- verify() ist browser-agnostisch (arbeitet auf HTML-Strings)
- Nutze htmlToDomNode() aus src/core/html-to-dom.ts fuer DOM-Parsing
- Cookie-Werte NIEMALS speichern (nur Name + exists)
- Request-Bodies NIEMALS speichern (nur URL + Method + Status)

VALIDIERUNG:
  npx tsc --noEmit
  npx vitest run --exclude='tests/real-world/**'
```

### Terminal F: verify() Tests (parallel)

**Exklusive Pfade (NEUE Dateien):**
- `tests/unit/verify.test.ts`
- `tests/unit/dom-diff.test.ts`
- `tests/unit/url-change.test.ts`
- `tests/unit/verify-strategies.test.ts`

```
Du bist der QA ENGINEER. Schreibe Tests fuer verify().

NEUE Test-Dateien:

1. tests/unit/dom-diff.test.ts:
   - Identische DOMs → leerer Diff
   - Element hinzugefuegt → addedElements = 1
   - Element entfernt → removedElements = 1
   - Attribut geaendert (class "error" hinzugefuegt) → erkannt
   - Text-Content geaendert ("Welcome User" erscheint) → erkannt
   - Script/Style-Aenderungen → IGNORIERT (Noise-Filter)
   - Grosser DOM (1000+ Nodes) → Performance < 100ms

2. tests/unit/url-change.test.ts:
   - Gleiche URL → no_change
   - Hash-Change (#section) → hash_change
   - Path-Change (/login → /dashboard) → navigation
   - Query-Change (?page=2) → query_change
   - Cross-Origin → redirect

3. tests/unit/verify-strategies.test.ts:
   - Login: URL changed + form gone → verified (conf >= 0.70)
   - Login: URL unchanged + error message → failed
   - Login: URL unchanged + no change → inconclusive
   - Form: POST 200 + success text → verified
   - Form: POST 400 + error text → failed
   - Navigation: URL changed + new heading → verified
   - Modal: dialog added + backdrop → verified
   - Modal: dialog removed → verified (modal_close)

4. tests/unit/verify.test.ts:
   - verify() mit minimalem Input → funktioniert
   - verify() mit unbekanntem Szenario → BalageInputError
   - verify() mit leerem HTML → graceful handling
   - Integration: analyzeFromHTML → verify mit endpointType

Mindestens 20 Tests total.

WICHTIG: Die Tests importieren aus src/core/verify.ts und
src/core/verify-checks/. Falls diese Dateien noch nicht existieren
(Terminal E arbeitet parallel), schreibe die Tests trotzdem —
sie werden rot sein bis Terminal E fertig ist.

Nutze das gleiche Test-Pattern wie bestehende Tests:
  import { describe, it, expect } from "vitest";
```

### Merge-Gate Wave 3:
```bash
npx tsc --noEmit                                    # 0 Errors
npm run lint                                         # < 5 Warnings
npx vitest run --exclude='tests/real-world/**'       # Alle Tests gruen
# verify() ist exportiert:
node -e "const m = require('./packages/core/dist/index.cjs'); console.log('verify' in m)"
```

---

## Definition of Done (Sprint-Ende)

```
[ ] ESLint Warnings < 5
[ ] Wikipedia-Test gefixt (fehlendes await)
[ ] F1-Score: Heuristik-Verbesserungen implementiert + getestet
[ ] verify() API exportiert mit >= 20 Tests
[ ] Alle bestehenden 607 Tests gruen
[ ] Commits: 1 pro Wave, saubere Git History
[ ] npm publish: balage-core@0.2.0-alpha (mit verify())
```
