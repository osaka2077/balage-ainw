# ERRORS.md

### ERR-001: Phase-1 Precision systematisch deflated durch falschen Nenner
**Datum:** 2026-03-20
**Problem:** Phase-1 Precision war 34.3% obwohl die Pipeline Phase-1-Endpoints korrekt erkennt. Ursache: `computeMetrics(gtPhase1, allDetected)` berechnet `precision = matched / allDetected.length`, wobei `allDetected` auch navigation/content-Endpoints enthaelt, die nie Phase-1 sein koennen. Bei Wikipedia z.B.: 1 Phase-1 Match, 8 total detected -> P = 0.125 statt 1.0.
**Falscher Code:**
```typescript
const metricsPhase1 = computeMetrics(gtPhase1, detected);
// computeMetrics: precision = matched / detected.length
// detected = ALLE Endpoints inkl. navigation, content
```
**Richtiger Code:**
```typescript
const metricsPhase1 = computePhase1Metrics(gtPhase1, detected);
// computePhase1Metrics: Filtert detected auf Typen die via TYPE_ALIASES
// zu Phase-1-GT-Typen passen, dann precision = matched / relevantDetected.length
```
**Regel:** Bei Subset-Metriken (Phase-1, per-type, etc.) immer auch den Nenner auf das relevante Subset filtern, nicht nur den Zaehler.

### ERR-002: matchedSegment per Type statt ID (analyze.ts)
**Datum:** 2026-03-25
**Problem:** Bei LLM-Analyse werden EndpointCandidates per `segments.find(s => s.type === c.type)` zum Segment gematcht. Bei mehreren Segmenten gleichen Typs (z.B. 2x "navigation") bekommt jeder Candidate den Kontext des ERSTEN Segments statt des korrekten.
**Falscher Code:**
```typescript
const matchedSegment = segments.find(s => s.type === c.type) ?? segments[0];
```
**Richtiger Code:**
```typescript
// segmentId wird beim Erzeugen der Candidates in processSegment gesetzt
const matchedSegment = (c.segmentId && segments.find(s => s.id === c.segmentId))
  ?? segments.find(s => s.type === c.type)
  ?? segments[0];
```
**Regel:** Segment-Zuordnung immer per eindeutiger ID, nie per Typ-Match. Bei LLM-Pipeline die Herkunfts-Info mitfuehren.

### ERR-003: llmCalls zaehlt Segmente statt tatsaechliche LLM-Aufrufe (analyze.ts)
**Datum:** 2026-03-25
**Problem:** `llmCalls = segments.filter(s => s.interactiveElementCount >= 1).length` zaehlt ungefilterte Segmente. Die `generateEndpoints()`-Funktion filtert intern nochmal (INTERACTIVE_SEGMENT_TYPES, interactiveElementCount). Die gemeldete Zahl war daher hoeher als die tatsaechlichen API-Calls.
**Falscher Code:**
```typescript
llmCalls = segments.filter(s => s.interactiveElementCount >= 1).length;
```
**Richtiger Code:**
```typescript
// generateEndpoints gibt jetzt { candidates, llmCalls } zurueck
const result = await generateEndpoints(segments, context, options);
llmCalls = result.llmCalls; // = filteredSegments.length (tatsaechliche Calls)
```
**Regel:** Metriken ueber externe Aufrufe (LLM, API) immer dort zaehlen wo sie tatsaechlich passieren, nicht am Aufrufer schaetzen.

### ERR-004: Children-Filter in html-to-dom.ts (KEIN BUG)
**Datum:** 2026-03-25
**Problem:** Verdaechtiger Filter `children.filter(c => c.tagName !== "#text" || !c.textContent)` sah invertiert aus. Analyse ergab: Der Filter ist KORREKT. Text-Nodes werden nur erzeugt wenn `textBuffer.trim()` truthy ist, also haben alle #text-Nodes immer textContent. Der Filter entfernt sie korrekt aus den Children (Text wurde bereits auf das Parent-`textContent` gehoben).
**Regel:** Vor Filter-Aenderungen pruefen unter welchen Bedingungen die gefilterten Objekte erzeugt werden. Leere Strings und `undefined` unterscheiden.

### ERR-005: extractStructuredDOM crasht mit __name ReferenceError
**Datum:** 2026-03-26
**Problem:** esbuild/tsx transpiliert benannte Funktionen innerhalb von `page.evaluate()` und fuegt `__name()` Aufrufe ein (keepNames-Feature). `__name` wird als top-level Variable definiert, existiert aber nicht im Playwright Browser-Kontext. Ergebnis: Jede DOM-Extraktion schlaegt fehl, gesamter Benchmark gibt F1=0 fuer ALLE Sites.
**Falscher Code:**
```typescript
// esbuild transpiliert dies zu: __name(buildDomPath, "buildDomPath")
// __name ist im Browser nicht definiert
const rawDom = await page.evaluate((params) => {
  function buildDomPath(el) { ... }
});
```
**Richtiger Code:**
```typescript
const rawDom = await page.evaluate((params) => {
  // Polyfill: esbuild __name() im Browser-Kontext
  if (typeof (globalThis as any).__name === "undefined") {
    (globalThis as any).__name = (target: unknown) => target;
  }
  const buildDomPath = (el: Element): string => { ... };
});
```
**Regel:** Code in `page.evaluate` laeuft in einem isolierten Browser-Kontext. Top-level Transpiler-Helpers sind dort nicht verfuegbar. Immer Polyfills einfuegen oder rein auf Browser-APIs beschraenken.

### ERR-006: Fixture-Modus zerstoert SPA-HTML durch Script-Hydration
**Datum:** 2026-03-26
**Problem:** `page.setContent(fixtureHtml)` laedt externe `<script>` und `<link>` Tags. Bei SPAs (React/Vue/Angular) fuehrt das JavaScript-Hydration aus, die den vorgerenderten DOM-Content ersetzt. Trello's `<div id="root">` wurde durch einen Loading-Spinner ersetzt, die 20 interaktiven Login-Elemente auf 2 reCAPTCHA-Textareas reduziert. Ergebnis: 0 echte Endpoints, LLM sieht nur `<textarea name="g-recaptcha-response">`.
**Falscher Code:**
```typescript
await page.setContent(fixtureHtml, { waitUntil: "domcontentloaded" });
// Externe Scripts werden geladen und ueberschreiben den SSR-Content
```
**Richtiger Code:**
```typescript
await page.route("**/*.js", route => route.abort());
await page.route("**/*.css", route => route.abort());
await page.setContent(fixtureHtml, { waitUntil: "domcontentloaded" });
```
**Regel:** HTML-Fixtures sind Snapshots des gerenderten DOM. Bei `setContent` muessen externe Scripts blockiert werden, damit die SPA nicht re-hydrated und den Content ueberschreibt.

### ERR-007: CART_EVIDENCE Regex zu breit — "bag" matcht auf CSS-Klassen
**Datum:** 2026-03-27
**Problem:** Booking.com checkout-to-search Korrektur wird blockiert weil CART_EVIDENCE `/bag/i` auf OneTrust-CSS-Klassen matcht (z.B. "bag" in Style-Attributen). CART_LABEL_EVIDENCE hatte gleiches Problem mit `/bag/i`.
**Falscher Code:**
```typescript
const CART_EVIDENCE = /cart|basket|warenkorb|bag|checkout|einkaufswagen/i;
const CART_LABEL_EVIDENCE = /\b(cart|warenkorb|basket|bag|add.to)/i;
```
**Richtiger Code:**
```typescript
const CART_EVIDENCE = /\bcart\b|basket|warenkorb|shopping.?bag|checkout.?form|einkaufswagen|zur.?kasse/i;
const CART_LABEL_EVIDENCE = /\b(cart|warenkorb|basket|shopping.?bag|add.to.cart|add.to.bag|add.to.basket)/i;
```
**Regel:** Regex-Patterns fuer DOM-Evidence muessen spezifisch genug sein um CSS-Klassen, Script-Variablen und Inline-Styles nicht als False Positives zu matchen. Eigenstaendige Woerter wie "bag" oder "checkout" sind zu generisch.

### ERR-008: Support-Type-Cap=1 blockiert Sites mit mehreren Support-Endpoints
**Datum:** 2026-03-27
**Problem:** Zendesk hat 2 distinkte Support-Endpoints (Submit a Request + Contact Support), aber der Deduplicator-Cap `support: 1` filtert den zweiten raus. Ergebnis: 50% Recall statt 100% fuer Support-Typ.
**Falscher Code:**
```typescript
const TYPE_CAPS = { support: 1 };
```
**Richtiger Code:**
```typescript
const TYPE_CAPS = { support: 2 };
```
**Regel:** Type-Caps muessen die reale Varianz von Endpoints abbilden. Support-Sites haben oft "Submit Request" (Ticket) + "Contact" (Chat/Phone) als separate Flows.

### ERR-009: SAFETY_CAP=10 zu hoch — Over-Detection bei Sites mit dichter Confidence-Verteilung
**Datum:** 2026-03-27
**Problem:** Wikipedia, Stripe, Shopify, Stackoverflow, Typeform detektierten 9-10 Endpoints bei 5-6 Ground-Truth. Der Gap-Cutoff fand keinen Gap >= 0.18 in diesen dichten Confidence-Verteilungen, also griff nur der SAFETY_CAP — der bei 10 nichts abschnitt. Precision fiel von 72.4% auf 70.5%. Support-Cap 1->2 (ERR-008 Fix) verschaerfte das Problem, weil ein zusaetzlicher Typ-Slot geoeffnet wurde.
**Falscher Code:**
```typescript
const SAFETY_CAP = 10;
```
**Richtiger Code:**
```typescript
const SAFETY_CAP = 8;
```
**Regel:** SAFETY_CAP muss an der realen Ground-Truth-Verteilung kalibriert sein. 95% der Sites haben <=8 echte Endpoints. Der Cap ist die letzte Verteidigungslinie wenn der Gap-Cutoff nicht greift.

### ERR-011: applySiteSpecificCorrections wird nie aufgerufen (toter Code) — GEFIXT
**Datum:** 2026-03-27 (dokumentiert) / 2026-03-28 (gefixt)
**Problem:** `applySiteSpecificCorrections()` ist nur innerhalb `runPostProcessing()` registriert, aber `runPostProcessing()` wird nirgendwo importiert oder aufgerufen. Die gesamten site-specific Corrections (Booking checkout->search, OneTrust consent, Zendesk auth->support) waren toter Code und hatten keinen Effekt in Production.
**Falscher Code:**
```typescript
// endpoint-generator.ts processSegment():
applyTypeCorrections(candidates, segText, segment.type);
// applySiteSpecificCorrections FEHLTE HIER
applyConfidencePenalties(candidates, segText, segment.type);
```
**Richtiger Code:**
```typescript
// endpoint-generator.ts processSegment() — Reihenfolge wie in runPostProcessing():
applyTypeCorrections(candidates, segText, segment.type);
applySiteSpecificCorrections(candidates, segText);
applyConfidencePenalties(candidates, segText, segment.type);
```
**Regel:** Neue Post-Processing-Module muessen in der tatsaechlich aufgerufenen Pipeline registriert werden. Wenn `runPostProcessing()` nicht als Ganzes genutzt wird, muss jede Einzelfunktion explizit importiert und in der richtigen Reihenfolge aufgerufen werden.

### ERR-012: CART_EVIDENCE false positive fuer "checkout" auf Travel-Sites
**Datum:** 2026-03-27
**Problem:** `CART_EVIDENCE = /cart|basket|warenkorb|bag|checkout|einkaufswagen/i` matcht "checkout" auch im Kontext von Check-OUT-Daten (Abreise) auf Travel-Sites wie Booking.com. Das blockiert die checkout->search Korrektur, weil die Pipeline denkt es gibt echte Cart-Evidence.
**Falscher Code:**
```typescript
const CART_EVIDENCE = /cart|basket|warenkorb|bag|checkout|einkaufswagen/i;
// "checkout" als Wort fuer Abreise-Datum triggert false positive
```
**Richtiger Code:**
```typescript
const PRECISE_CART_EVIDENCE = /\bcart\b|basket|warenkorb|shopping.?bag|add.to.bag|add.to.cart|checkout.?form|einkaufswagen|zur.?kasse/i;
// Praeziser: "checkout" nur im Kontext "checkout form", nicht "checkout date"
```
**Regel:** Cart-Detection-Regex muss zwischen "checkout" (Shopping) und "check-out" (Travel-Datum) unterscheiden. Generische Regex fuer Rueckwaerts-Kompatibilitaet beibehalten, praezisere Version fuer Travel-Site-Corrections nutzen.

### ERR-013: Benchmark stddev() nutzt Populations-Varianz statt Stichproben-Varianz
**Datum:** 2026-03-28
**Problem:** Die `stddev()`-Funktion in `tests/real-world/benchmark-runner.ts` (Zeile 1184-1189) dividiert durch `values.length` statt `values.length - 1`. Bei N=3 Multi-Runs (Standard-Konfiguration) unterschaetzt dies die wahre Streuung um ~33%. Die berichteten Varianz-Werte sind systematisch zu optimistisch.
**Falscher Code:**
```typescript
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
```
**Richtiger Code:**
```typescript
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
```
**Regel:** Bei kleinen Stichproben (N < 30) IMMER Bessel's Correction verwenden (Division durch N-1 statt N). Populations-Varianz nur bei vollstaendigen Populationen.
