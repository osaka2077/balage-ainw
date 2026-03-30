# Firecrawl Integration — Implementation Plan

**Erstellt von:** COORDINATOR
**Datum:** 2026-03-29 (Tag 29)
**Status:** APPROVED — ausfuehrbar
**Quellen:** ENGINEER Design, SECURITY Threat Model, STRATEGIST Cost/Partnership Analysis, AI_ENGINEER ML Pipeline Plan
**Gesamtaufwand:** 62-78h (aufgeteilt in 6 Phasen, 3 Milestones)

---

## 0. KONFLIKTE ZWISCHEN AGENTS — ENTSCHEIDUNGEN

Bevor der Plan stehen kann, muessen vier Konflikte geloest werden.

### Konflikt 1: Aufwand-Schaetzung (ARCHITECT 19h vs. ENGINEER 12.5h)

**Entscheidung:** ENGINEER-Schaetzung (12.5h) gilt fuer die reine Feature-Implementation. ARCHITECTs 19h inkludiert Refactoring des bestehenden BrowserAdapters — das schieben wir in Phase 3 und machen es nur wenn Phase 2 fertig ist. Fazit: Phase 1+2 = 16-20h, Phase 3 = 6-8h zusaetzlich.

**Begruendung:** Playwright-Refactor ist nice-to-have, nicht Blocker fuer Firecrawl. ENGINEER kennt den Code und schaetzt realistischer.

### Konflikt 2: Security-Aufwand (SECURITY sagt 36-59h)

**Entscheidung:** Security-Tasks werden in P0 (Blocker, 12-18h) und P1/P2 (Follow-up, 24-41h) aufgeteilt. Nur P0-Security-Tasks blockieren die Integration. P1/P2-Tasks laufen parallel oder nachgelagert.

**Begruendung:** SECURITY hat Recht dass alle Punkte wichtig sind. Aber wir koennen die Integration nicht 2 Wochen blockieren fuer Circuit Breaker und URL-Privacy-Classifier. Der SSRF-Fix, Key-Schutz, und Response-Size-Limit sind P0 — alles andere ist nachziehbar. Priorisierung: Security > Correctness > Speed.

### Konflikt 3: AI_ENGINEER will Markdown-Context vs. ENGINEER will kein Feature-Creep

**Entscheidung:** Markdown-Context kommt in Phase 4 (nach der Basis-Integration), NICHT in Phase 2. Phase 2 liefert `analyzeFromURL()` mit reinem HTML. Phase 4 erweitert die Pipeline um Markdown als optionalen Kontext fuer den LLM-Call.

**Begruendung:** AI_ENGINEER hat quantitativ gezeigt dass Markdown-Context +2-4pp F1 bringen koennte. Aber ENGINEER hat Recht: erst funktioniert die Basis, dann kommt die ML-Optimierung. Sequentiell, nicht gleichzeitig.

### Konflikt 4: STRATEGIST "JETZT bauen" vs. SECURITY "erst Blocker fixen"

**Entscheidung:** Beide haben Recht. Phase 0 (Security Prerequisites) laeuft VOR Phase 2 (Integration). Aber Phase 0 dauert nur 12-18h, nicht 59h. Die P0-Security-Tasks sind in 2 Tagen machbar. Danach kann gebaut werden.

**Begruendung:** Wir shippen keine SSRF-Luecke. Aber wir warten auch nicht auf einen URL-Privacy-Classifier bevor wir ein `analyzeFromURL()` haben. Reihenfolge: Kritische Security → Feature → Restliche Security.

---

## 1. PHASEN-UEBERSICHT

```
Phase 0: Security Prerequisites       [12-18h]  [Tag 29-31]   SECURITY + ENGINEER
  Gate: SSRF-Fix, Key-Schutz, Response-Size-Limit bestanden
         ↓
Phase 1: Core Abstraction             [6-8h]    [Tag 31-32]   ENGINEER
  Gate: PageFetcher Interface + Registry + Error-Klassen in CI gruen
         ↓
Phase 2: Firecrawl Adapter            [8-12h]   [Tag 32-34]   ENGINEER + QA
  Gate: analyzeFromURL() funktioniert end-to-end, 5 URLs getestet
         ↓ ← MILESTONE 1: MVI (Minimum Viable Integration) ←
         ↓
Phase 3: Playwright Refactor          [6-8h]    [Tag 34-36]   ENGINEER
Phase 4: ML Pipeline Enhancement      [8-12h]   [Tag 34-38]   AI_ENGINEER
  (Phase 3+4 laufen PARALLEL)
  Gate: Playwright implementiert PageFetcher, Markdown-Context live
         ↓ ← MILESTONE 2: V1 Complete ←
         ↓
Phase 5: Vision Verification          [6-8h]    [Tag 38-40]   AI_ENGINEER
Phase 6: Documentation + Publish      [4-6h]    [Tag 40-42]   ENGINEER + STRATEGIST
  (Phase 5+6 laufen PARALLEL)
         ↓ ← MILESTONE 3: Public Release ←
```

---

## 2. TASK-ZERLEGUNG

### Phase 0: Security Prerequisites (BLOCKER)

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-001 | **SSRF-Fix: `isPrivateHost()` erweitern** in `src/api/schemas.ts`. Hinzufuegen: IPv6-Loopback (`::1`, `::ffff:127.0.0.1`), IPv6-Private (`fc00::/7`, `fe80::/10`), Cloud-Metadata (`169.254.169.254`, `metadata.google.internal`, `100.100.100.200`), Dezimal-IP-Notation (Integer-Parse), Oktal-IP-Notation (fuehrende Null), URL-Encoded Hostnames (decode vor check), `.local`/`.internal` TLDs. | SECURITY | - | 4-6h | P0 | Unit-Tests decken alle 8 Bypass-Varianten ab. Kein False-Positive auf `google.com`, `amazon.de`. |
| FC-002 | **URL-Validator bauen** als `src/security/url-validator.ts`. Funktion: `validateFetchUrl(url: string): { valid: boolean; reason?: string }`. Prueft: (1) Schema-Whitelist (nur `https://`, `http://` nur wenn `BALAGE_ALLOW_HTTP=true`), (2) `isPrivateHost()` auf decoded Hostname, (3) DNS-Resolution-Check (hostname aufloesen, IP pruefen). Export in `src/security/index.ts`. | SECURITY | FC-001 | 4-6h | P0 | 15+ Unit-Tests inkl. `file://`, `gopher://`, `javascript:`, DNS-Rebinding-Mock. |
| FC-003 | **Firecrawl API Key Protection**: `FirecrawlApiError` Klasse in `src/adapter/fetcher-errors.ts` die NIEMALS den Key enthaelt. Error-Handler-Middleware erweitern: alle Errors die von Firecrawl kommen durch `CredentialGuard.scan()` filtern bevor sie geloggt oder an Client gesendet werden. | ENGINEER | - | 2-3h | P0 | Test: Error mit Key im Message wird geloggt/returned OHNE Key. Regex-Pattern `fc-[a-zA-Z0-9]+` wird immer redacted. |
| FC-004 | **Response-Size-Limit**: HTTP-Client-Wrapper der Firecrawl-Responses bei >5MB abortiert. Konfigurierbar via `BALAGE_FIRECRAWL_MAX_RESPONSE_SIZE_MB` (default: 5). Implementierung: Content-Length Header pruefen VOR Body-Read, Streaming-Abort wenn Body >5MB waechst. | ENGINEER | - | 2-3h | P0 | Test: Mock-Response mit 6MB → abort + `FetchError` mit klarer Message. Test: 1MB Response → durchgelassen. |

**Phase 0 Gate:** FC-001 bis FC-004 alle DONE. CI gruen. Security-Review durch SECURITY Agent bestanden.

---

### Phase 1: Core Abstraction

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-005 | **PageFetcher Interface** erstellen als `src/adapter/fetcher.ts`. Exakt wie im ENGINEER Design Doc Abschnitt 3.1: `PageFetcher` Interface mit `fetch(url, options)` und `close()`. Zod-Schemas fuer `FetchOptions`, `FetchMetadata`, `FetchTiming`, `FetchResult`. Kein runtime-Code, nur Typen und Schemas. | ENGINEER | FC-001 | 2-3h | P1 | TypeScript kompiliert. Alle Typen sind exported. Keine Runtime-Dependencies. |
| FC-006 | **Fetcher Error Classes** erstellen als `src/adapter/fetcher-errors.ts`. 6 Klassen: `FetchError`, `FetchTimeoutError`, `FetchBotProtectionError`, `FetchNetworkError`, `FetchRateLimitError`, `FetchConfigError`. Jede Error-Klasse hat `url`, `code`, `name`. `FetchConfigError` hat `FirecrawlApiError`-Subklasse (aus FC-003). | ENGINEER | FC-003 | 1-2h | P1 | Error-Instanzen haben korrektes `instanceof`-Verhalten. Tests pruefen alle 6 Klassen. |
| FC-007 | **Fetcher Registry / Auto-Detection** erstellen als `src/adapter/create-fetcher.ts`. Funktion: `createFetcher(options): PageFetcher`. Logik: (1) Wenn `provider: 'firecrawl'` + API Key → FirecrawlFetcher. (2) Wenn `provider: 'playwright'` → PlaywrightFetcher. (3) Wenn `provider: 'auto'` → Firecrawl wenn Key vorhanden, sonst Playwright. (4) Wenn keins → Error mit klarer Message. | ENGINEER | FC-005, FC-006 | 2-3h | P1 | Unit-Tests: Auto-Detection waehlt korrekt basierend auf env vars. Explizite Provider-Angabe ueberschreibt Auto. Fehlende Config → klarer Error. |
| FC-008 | **Env-Config erweitern** in `src/config/env.ts`. Neue Felder: `firecrawlApiKey` (aus `BALAGE_FIRECRAWL_API_KEY`), `firecrawlApiUrl` (aus `BALAGE_FIRECRAWL_API_URL`, default: `https://api.firecrawl.dev`), `firecrawlEnabled` (aus `BALAGE_FIRECRAWL_ENABLED`, default: `false`), `firecrawlMaxResponseSizeMb` (default: 5), `firecrawlTimeoutMs` (default: 30000), `allowHttp` (aus `BALAGE_ALLOW_HTTP`, default: `false`). | ENGINEER | - | 1h | P1 | Type-safe Zugriff auf alle neuen Config-Felder. Defaults korrekt. |

**Phase 1 Gate:** FC-005 bis FC-008 alle DONE. `npm run build` und `npm test` gruen.

---

### Phase 2: Firecrawl Adapter + analyzeFromURL()

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-009 | **FirecrawlFetcher Implementation** erstellen als `src/adapter/firecrawl-fetcher.ts`. Exakt wie im ENGINEER Design Doc Abschnitt 3.3. Lazy SDK Import (`@mendable/firecrawl-js`). Retry mit Exponential Backoff (max 2, base 1s). Rate-Limit-Detection (429). Timeout-Detection. Eigene minimale SDK-Type-Definitions (keine harte Abhaengigkeit auf SDK-Typen). `url-validator` aus FC-002 VOR jedem Firecrawl-Call aufrufen. | ENGINEER | FC-002, FC-004, FC-005, FC-006, FC-008 | 3-4h | P1 | Integration-Test mit gemocktem Firecrawl SDK: (1) Erfolgreicher Scrape, (2) 429 Rate Limit → Retry, (3) Timeout → FetchTimeoutError, (4) Private IP → Rejected vor SDK-Call, (5) Response >5MB → Aborted. |
| FC-010 | **`analyzeFromURL()` API** in `src/core/analyze.ts` hinzufuegen. Signatur: `analyzeFromURL(url: string, options?: AnalyzeFromURLOptions): Promise<AnalysisResult>`. Implementierung: (1) URL validieren (FC-002), (2) createFetcher (FC-007), (3) fetcher.fetch(url), (4) analyzeFromHTML(fetchResult.html, mergedOptions), (5) fetchResult.metadata in AnalysisResult.meta einfuegen. FetchResult-Timing zu AnalysisResult.timing addieren. Fetcher am Ende `close()`-en (finally-Block). | ENGINEER | FC-007, FC-009 | 3-4h | P1 | Smoke-Test: `analyzeFromURL('https://github.com/login', { llm: false })` gibt Endpoints zurueck. AnalysisResult.meta enthaelt `fetcherType: 'firecrawl'` und `fetchTiming`. |
| FC-011 | **`@mendable/firecrawl-js` als optionale Dependency** einfuegen. In `package.json`: `peerDependencies` mit `"@mendable/firecrawl-js": ">=1.0.0"` und `peerDependenciesMeta: { "@mendable/firecrawl-js": { optional: true } }`. NICHT in `dependencies`. | ENGINEER | FC-009 | 0.5h | P1 | `npm install` ohne Firecrawl SDK installiert funktioniert. Import-Fehler gibt klare Message. |
| FC-012 | **Public Export** in `src/core/index.ts`: `analyzeFromURL` und `AnalyzeFromURLOptions` exportieren. In `src/adapter/index.ts`: `PageFetcher`, `FetchResult`, `FirecrawlFetcher`, `createFetcher` exportieren. | ENGINEER | FC-010 | 0.5h | P1 | `import { analyzeFromURL } from '@balage/core'` funktioniert. |
| FC-013 | **End-to-End Test** mit 5 echten URLs (NICHT gemockt, nur in CI mit Firecrawl Key). URLs: `https://github.com/login`, `https://www.google.com`, `https://news.ycombinator.com`, `https://stripe.com/docs`, `https://www.npmjs.com`. Test: Fuer jede URL: (1) analyzeFromURL gibt Ergebnis, (2) endpoints.length >= 1, (3) meta.fetcherType === 'firecrawl', (4) timing.totalMs > 0. Markiert als `@skip` wenn kein `FIRECRAWL_API_KEY` in env. | QA | FC-010 | 2h | P1 | 5/5 URLs geben valide Ergebnisse. Test ist in CI integrierbar (skippable). |
| FC-014 | **Firecrawl-spezifischer Cost-Limiter**. Neues Modul `src/security/firecrawl-limiter.ts`. In-Memory Counter: Calls pro Minute (max 10), Calls pro Stunde (max configurable, default 100), Tagesbudget (max configurable, default $5 bei $0.001/Call = 5000 Calls). Pruefung VOR jedem Firecrawl-Call in `FirecrawlFetcher.fetch()`. Bei Ueberschreitung: `FetchRateLimitError` mit klarer Message welches Limit erreicht wurde. | SECURITY | FC-006 | 3-4h | P1 | Unit-Tests: (1) 11. Call pro Minute → blocked, (2) 101. Call pro Stunde → blocked, (3) Counter resettet nach Minute/Stunde. |

**Phase 2 Gate (= MILESTONE 1: MVI):** `analyzeFromURL()` funktioniert end-to-end mit Firecrawl. 5 URLs erfolgreich getestet. SSRF geschuetzt. Key nie geleakt. Cost-Limiter aktiv. `npm run build && npm test` gruen.

---

### Phase 3: Playwright Refactor (parallel zu Phase 4)

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-015 | **PlaywrightFetcher Implementation** erstellen als `src/adapter/playwright-fetcher.ts`. Implementiert `PageFetcher` Interface. Lazy Browser-Launch beim ersten `fetch()`. Cookie-Banner-Dismissal aus `capture-fixtures.ts` portieren. Screenshot-Support via `page.screenshot({ encoding: 'base64' })`. Bot-Protection-Detection (Cloudflare challenge page pattern). `close()` schliesst Browser-Instanz. | ENGINEER | FC-005, FC-006 | 4-5h | P2 | Integration-Test: (1) Fetch von localhost-Testserver gibt HTML, (2) Screenshot-Option liefert base64-PNG, (3) close() raeumt Browser auf (kein Prozess-Leak), (4) Zweiter fetch() nach close() → Error. |
| FC-016 | **createFetcher Auto-Detection** Update. `createFetcher` mit `provider: 'auto'`: Wenn Firecrawl Key vorhanden UND `BALAGE_FIRECRAWL_ENABLED=true` → Firecrawl. Sonst → Playwright (wenn `playwright` installiert). Sonst → Error mit Installations-Anleitung. | ENGINEER | FC-007, FC-015 | 1h | P2 | Unit-Test: Auto-Detection bevorzugt Firecrawl wenn Key da. Fallback auf Playwright wenn kein Key. Error wenn keins verfuegbar. |
| FC-017 | **BrowserAdapter Interop**: Bestehender `BrowserAdapter` in `src/adapter/browser-adapter.ts` bleibt unveraendert. `PlaywrightFetcher` ist eine SEPARATE Klasse fuer einmalige Fetches. Dokumentation in Code-Kommentar: "BrowserAdapter = langlebige Sessions mit Context-Management. PlaywrightFetcher = einmalige Fetch-Operationen." | ENGINEER | FC-015 | 0.5h | P2 | Code-Kommentar vorhanden. Keine Aenderungen an BrowserAdapter. |

---

### Phase 4: ML Pipeline Enhancement (parallel zu Phase 3)

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-018 | **Markdown-Context fuer LLM-Prompt**. Wenn `analyzeFromURL()` genutzt wird UND Firecrawl auch Markdown liefert: Markdown als zusaetzlichen Kontext an den LLM-Prompt anhaengen. Neues optionales Feld in `FetchResult`: `markdown?: string`. In `buildExtractionPrompt()` (in `src/semantic/prompts.ts`): Wenn markdown vorhanden, haenge einen "Page Summary (from Markdown)" Block an den User-Prompt. Max 2000 Chars Markdown (truncate wenn laenger). | AI_ENGINEER | FC-010 | 3-4h | P2 | A/B Benchmark: 3-Run F1 mit Markdown-Context vs. ohne auf 5 Test-Sites. Erwartung: +1-3pp. Kein Regression auf den anderen 15 Sites. |
| FC-019 | **FetchResult erweitern: Markdown + Screenshot**. `FirecrawlFetcher` anpassen: Request-Formats auf `['html', 'markdown']` erweitern (immer beide). Neues Feld `markdown` in `FetchResult`. `screenshot` bleibt opt-in. | AI_ENGINEER | FC-009 | 1-2h | P2 | Test: Firecrawl-Mock liefert HTML + Markdown → beides in FetchResult vorhanden. |
| FC-020 | **HTML-Kommentar-Stripping im InputSanitizer**. In `src/security/input-sanitizer.ts`: Neue Methode oder Erweiterung von `sanitizeForLLM()` die HTML-Kommentare entfernt (`<!--[\s\S]*?-->`). Auch `<meta name="description">` Content pruefen mit InjectionDetector. Muss VOR dem LLM-Call passieren, also in der bestehenden Security-Pipeline in `endpoint-generator.ts` Zeile 508-523. | SECURITY | - | 2-3h | P1 | Test: HTML mit `<!-- ignore previous instructions -->` Kommentar → Kommentar entfernt vor LLM-Call. Test: normaler HTML-Kommentar `<!-- copyright 2024 -->` → auch entfernt (security-first). |
| FC-021 | **CredentialGuard auf Endpoint-Output**. In `src/core/analyze.ts`: Nach der LLM-Analyse (nach `reconcileEnsembleResults` bzw. `runLLMAnalysis`), alle Endpoint-Felder (label, description, selector, evidence) durch `CredentialGuard.scan()` pruefen. Wenn Credentials gefunden: Felder redacten, Confidence auf 0.3 setzen (wird wahrscheinlich vom Gap-Cutoff entfernt). | SECURITY | - | 2-3h | P1 | Test: Endpoint mit `selector: "input[value='sk-abc123xyz']"` → value wird redacted. |

---

### Phase 5: Vision Verification (opt-in)

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-022 | **Screenshot-basierter Verification Pass**. Wenn `analyzeFromURL()` mit `screenshot: true` aufgerufen wird UND ein Screenshot in `FetchResult` vorhanden: Optionaler 3. LLM-Pass der den Screenshot (base64) an ein Vision-Modell sendet mit der Frage: "Verify these detected endpoints against the screenshot." Opt-in via `BALAGE_VISION_VERIFY=1`. Nutzt Claude Haiku oder GPT-4o-mini Vision. | AI_ENGINEER | FC-010, FC-019 | 4-5h | P3 | Test mit Mock: Screenshot + 5 Endpoints → Vision bestaetigt 4, rejectet 1. Opt-in-Flag funktioniert. Ohne Flag: kein Vision-Call. |
| FC-023 | **Vision-Cost-Guard**. Vision-Verification darf maximal $0.02 pro Call kosten (ein Screenshot ist ~1300 Tokens Input + ~200 Tokens Output). Cost-Tracking in `AnalysisResult.timing`: neues Feld `visionCalls: number`. | AI_ENGINEER | FC-022 | 1-2h | P3 | Test: timing.visionCalls === 1 wenn Vision aktiv, === 0 wenn nicht. |

---

### Phase 6: Documentation + Publish

| ID | Beschreibung | Owner | blockedBy | Aufwand | Prio | Akzeptanzkriterium |
|----|-------------|-------|-----------|---------|------|--------------------|
| FC-024 | **Integration-Beispiel**: `examples/firecrawl-integration/` mit `README.md` und `index.ts`. Zeigt: (1) analyzeFromURL mit Firecrawl, (2) Endpoints filtern, (3) Mit Playwright ausfuehren. Lauffaehig mit `npx tsx examples/firecrawl-integration/index.ts`. | ENGINEER | FC-010 | 2h | P2 | Beispiel laeuft. README erklaert Setup in <2 Minuten. |
| FC-025 | **API-Dokumentation Update**: `docs/README.md` und JSDoc in `src/core/analyze.ts` aktualisieren. Neue Sektion: "URL-based Analysis" mit Code-Beispiel, Config-Optionen, Error-Handling. Environment-Variables dokumentieren. | ENGINEER | FC-012 | 1-2h | P2 | Doku enthaelt: analyzeFromURL Signatur, alle neuen env vars, Error-Klassen, Firecrawl Setup-Anleitung. |
| FC-026 | **CHANGELOG Update** und Version Bump. Neuer Eintrag in CHANGELOG.md. Version bump auf 0.7.0 (minor, da neue API-Surface). `npm version minor`. | ENGINEER | FC-025 | 0.5h | P2 | CHANGELOG hat Eintrag. package.json zeigt 0.7.0. |
| FC-027 | **Security-Dokumentation**. `docs/security/FIRECRAWL-SECURITY-GUIDE.md` mit: (1) Empfohlene Config fuer Cloud vs. Self-Hosted, (2) Alle Security-relevanten env vars, (3) SSRF-Protection erklaert, (4) DSGVO-Hinweis (URLs koennen PII enthalten, Self-Hosted fuer sensible Daten). | SECURITY | FC-002 | 1-2h | P2 | Guide deckt alle P0/P1-Security-Massnahmen ab. |

---

## 3. KRITISCHER PFAD

```
FC-001 (SSRF-Fix)
    ↓
FC-002 (URL-Validator)
    ↓
FC-009 (FirecrawlFetcher)  ← haengt auch ab von FC-004, FC-005, FC-006, FC-008
    ↓                         die alle PARALLEL zu FC-001/002 laufen koennen
FC-010 (analyzeFromURL)
    ↓
FC-013 (E2E Test)
    ↓
★ MILESTONE 1: MVI

Kritischer Pfad: FC-001 → FC-002 → FC-009 → FC-010 → FC-013
Dauer auf dem kritischen Pfad: ~18-25h (4-5 Tage bei 5h/Tag)
```

### Parallelisierungs-Plan

```
Tag 29-30:
  SECURITY:  FC-001 (SSRF) + FC-002 (URL-Validator)     [8-12h]
  ENGINEER:  FC-003 (Key Protection) + FC-004 (Size Limit) + FC-005 (Interface) + FC-006 (Errors) + FC-008 (Config)  [6-9h]
  → Laufen komplett PARALLEL

Tag 31-32:
  ENGINEER:  FC-007 (Registry) + FC-009 (Firecrawl Adapter) [5-7h]
  SECURITY:  FC-014 (Cost Limiter)  [3-4h]
  → FC-007 wartet auf FC-005+FC-006 (Tag 29-30 fertig)
  → FC-009 wartet auf FC-002 (Tag 30 fertig) + FC-004+FC-005+FC-006+FC-008

Tag 32-34:
  ENGINEER:  FC-010 (analyzeFromURL) + FC-011 (Dep) + FC-012 (Export)  [4-5h]
  QA:        FC-013 (E2E Test)  [2h]
  SECURITY:  FC-020 (Comment Stripping) + FC-021 (CredentialGuard Output)  [4-6h]
  → FC-013 wartet auf FC-010

  ★ MILESTONE 1: MVI (Tag 34)

Tag 34-38:
  ENGINEER:     FC-015 (PlaywrightFetcher) + FC-016 + FC-017  [5.5-6.5h]
  AI_ENGINEER:  FC-018 (Markdown Context) + FC-019 (FetchResult Markdown)  [4-6h]
  → Phase 3 und Phase 4 laufen PARALLEL

  ★ MILESTONE 2: V1 (Tag 38)

Tag 38-42:
  AI_ENGINEER:  FC-022 + FC-023 (Vision Verify)  [5-7h]
  ENGINEER:     FC-024 + FC-025 + FC-026 (Docs + Publish)  [3.5-4.5h]
  SECURITY:     FC-027 (Security Guide)  [1-2h]
  → Phase 5 und Phase 6 laufen PARALLEL

  ★ MILESTONE 3: Public Release (Tag 42)
```

---

## 4. MINIMUM VIABLE INTEGRATION (MVI) — Was in 24h shipbar ist

Wenn nur 24h Entwicklungszeit vorhanden sind, ist Folgendes das absolute Minimum:

### MVI-Scope (24h)

| Task | Was genau | Stunden |
|------|-----------|---------|
| FC-001 (abgespeckt) | `isPrivateHost()` um Cloud-Metadata, localhost-Varianten erweitern. Ohne DNS-Resolution-Check. | 3h |
| FC-002 (abgespeckt) | URL-Validator nur mit Schema-Whitelist + isPrivateHost. Ohne DNS-Resolution. | 2h |
| FC-003 | Key-Protection (unveraendert) | 2h |
| FC-005+FC-006 | Interface + Errors (unveraendert) | 3h |
| FC-008 | Config (unveraendert) | 1h |
| FC-009 (abgespeckt) | FirecrawlFetcher ohne Retry-Logic (einfacher try/catch). Ohne Response-Size-Limit. | 2h |
| FC-010 | analyzeFromURL (unveraendert) | 3h |
| FC-012 | Public Export (unveraendert) | 0.5h |
| Smoke-Test | 1 URL manuell testen | 0.5h |
| **Total** | | **17h** |

### Was im MVI FEHLT und nachgezogen werden muss

- DNS-Resolution-Check gegen Rebinding (FC-001 full)
- Response-Size-Limit (FC-004)
- Retry-Logic mit Exponential Backoff (FC-009 full)
- Cost-Limiter (FC-014)
- Auto-Detection Registry (FC-007)
- E2E Tests (FC-013)
- Playwright-Fetcher (FC-015-017)
- Alle ML-Enhancements (FC-018-023)
- Dokumentation (FC-024-027)

### MVI-Risiken

| Risiko | Impact | Mitigation |
|--------|--------|-----------|
| Kein DNS-Resolution → DNS-Rebinding moeglich | Angreifer kann interne Services lesen | Nur fuer Development nutzen, nicht public deployen |
| Kein Response-Size-Limit → OOM moeglich | Prozess-Crash bei grossen Seiten | Firecrawl gibt selten >5MB zurueck, aber moeglich |
| Kein Cost-Limiter → Kosten-Explosion moeglich | Firecrawl-Rechnung > Budget | Nur mit eigenem API-Key nutzen, Firecrawl hat eigene Limits |

---

## 5. V1 PLAN (1 Woche = Tag 29-36)

V1 enthaelt alles aus Phase 0-3 plus die P1-Security-Tasks:

| Included | Tasks |
|----------|-------|
| Volle SSRF-Protection mit DNS-Check | FC-001, FC-002 |
| Key-Protection + Response-Size-Limit | FC-003, FC-004 |
| PageFetcher Interface + Registry | FC-005, FC-006, FC-007, FC-008 |
| FirecrawlFetcher mit Retry | FC-009 |
| analyzeFromURL() | FC-010, FC-011, FC-012 |
| E2E Tests | FC-013 |
| Cost-Limiter | FC-014 |
| PlaywrightFetcher | FC-015, FC-016, FC-017 |
| HTML-Kommentar-Stripping | FC-020 |
| CredentialGuard on Output | FC-021 |

**Nicht in V1:** Markdown-Context (FC-018/019), Vision-Verification (FC-022/023), Docs (FC-024-027).

---

## 6. V2 PLAN (nach Anthropic-Pitch, Tag 42+)

V2 baut auf V1 auf und fuegt die Differenzierungs-Features hinzu:

| Feature | Tasks | Impact |
|---------|-------|--------|
| Markdown-Context fuer LLM | FC-018, FC-019 | +1-3pp F1 auf Firecrawl-Seiten |
| Vision-Verification (opt-in) | FC-022, FC-023 | Precision-Boost auf komplexen Seiten |
| Full Documentation + Examples | FC-024, FC-025, FC-026, FC-027 | Onboarding < 2 Minuten |
| Circuit Breaker (aus Threat Model P2) | Neuer Task | Resilienz gegen Firecrawl-Ausfaelle |
| URL-Privacy-Classifier (aus Threat Model P2) | Neuer Task | DSGVO-Compliance-Warning |
| Firecrawl-Health in /api/v1/health | Neuer Task | Operations-Readiness |
| Side-by-Side Demo: Computer Use vs. BALAGE+Firecrawl | Neuer Task | Pitch-Material |

---

## 7. RISIKO-MATRIX

| # | Risiko | Wahrscheinlichkeit | Impact | Fallback |
|---|--------|-------------------|--------|----------|
| R1 | Firecrawl SDK Breaking Changes | 15% | Hoch — Adapter broken | Eigene SDK-Typen entkoppeln Compile-Fehler. Runtime: Pin SDK-Version in peerDeps. |
| R2 | Firecrawl Rate-Limits zu aggressiv | 25% | Mittel — Langsame E2E Tests | Retry-Backoff bereits eingebaut. Fuer Tests: Mock-Server nutzen statt Live-API. |
| R3 | Firecrawl HTML-Qualitaet unzureichend (SPA nicht gerendert) | 20% | Hoch — Endpoints nicht gefunden | Fallback auf PlaywrightFetcher via Auto-Detection. Dafuer Phase 3 noetig. |
| R4 | DNS-Rebinding-Angriff in Production | 5% | Kritisch — Interne Daten geleakt | FC-002 DNS-Resolution-Check loest das. Muss VOR public Release fertig sein. |
| R5 | Markdown-Context verschlechtert F1 statt zu verbessern | 30% | Mittel — Arbeit umsonst | Feature-Flag (`BALAGE_USE_MARKDOWN_CONTEXT=false`). A/B Benchmark VOR Default-Aktivierung. |
| R6 | Firecrawl Service-Ausfall waehrend Demo/Pitch | 10% | Hoch — Pitch gescheitert | PlaywrightFetcher als Fallback. Demo-Script mit beiden Providern vorbereiten. |
| R7 | `@mendable/firecrawl-js` npm Package kompromittiert (Supply Chain) | 2% | Kritisch — Code-Execution | Pin exakte Version in peerDeps. `npm audit` in CI. Lockfile committen. |
| R8 | F1 sinkt nach Markdown-Context-Integration (Regression) | 15% | Mittel — Rollback noetig | Benchmark VOR und NACH Aenderung. Feature-Flag default OFF. |

---

## 8. ABHAENGIGKEITS-GRAPH (visuell)

```
FC-001 ──→ FC-002 ──→ FC-009 ──→ FC-010 ──→ FC-013 (E2E)
                                     ↓              ↑
FC-003 ──→ FC-006 ──→ FC-009       FC-012        FC-014
                                     ↓
FC-004 ──────────────→ FC-009      FC-011
                                     ↓
FC-005 ──→ FC-006 ──→ FC-007      FC-018 (Markdown)
            ↓                        ↓
          FC-015 (Playwright)      FC-019
            ↓                        ↓
          FC-016                   FC-022 (Vision)
            ↓                        ↓
          FC-017                   FC-023

FC-008 ──────────────→ FC-009

FC-020 (Comment Strip)   ← unabhaengig
FC-021 (CredGuard Out)   ← unabhaengig
FC-024-027 (Docs)        ← warten auf FC-010+FC-012
```

---

## 9. DAILY STANDUPS — Was wann passieren muss

### Tag 29 (heute)
- SECURITY startet FC-001 (SSRF-Fix)
- ENGINEER startet FC-003 (Key Protection) + FC-005 (Interface) + FC-006 (Errors) + FC-008 (Config)
- Ziel EOD: FC-003, FC-005, FC-006, FC-008 DONE

### Tag 30
- SECURITY liefert FC-001, startet FC-002 (URL-Validator)
- ENGINEER startet FC-004 (Response Size Limit)
- ENGINEER beginnt FC-007 (Registry) sobald FC-005+FC-006 fertig
- Ziel EOD: FC-001, FC-004 DONE, FC-002 und FC-007 in progress

### Tag 31
- SECURITY liefert FC-002
- ENGINEER liefert FC-007, startet FC-009 (Firecrawl Adapter)
- SECURITY startet FC-014 (Cost Limiter)
- Ziel EOD: FC-002, FC-007 DONE, FC-009 in progress

### Tag 32
- ENGINEER liefert FC-009, startet FC-010 (analyzeFromURL)
- SECURITY liefert FC-014
- Ziel EOD: FC-009 DONE, FC-010 in progress

### Tag 33
- ENGINEER liefert FC-010, FC-011, FC-012
- QA startet FC-013 (E2E Test)
- SECURITY startet FC-020 (Comment Stripping) + FC-021 (CredGuard Output)
- Ziel EOD: FC-010, FC-011, FC-012 DONE

### Tag 34 — MILESTONE 1: MVI
- QA liefert FC-013
- SECURITY liefert FC-020, FC-021
- Gate-Review: analyzeFromURL funktioniert, Security-Basics bestanden
- ENGINEER startet Phase 3 (FC-015)
- AI_ENGINEER startet Phase 4 (FC-018, FC-019)

### Tag 35-36
- ENGINEER liefert FC-015, FC-016, FC-017
- AI_ENGINEER liefert FC-018, FC-019
- Milestone 2: V1 Complete

### Tag 37-42
- AI_ENGINEER: FC-022, FC-023 (Vision)
- ENGINEER + SECURITY: FC-024-FC-027 (Docs)
- Milestone 3: Public Release

---

## 10. ENTSCHEIDUNGS-LOG (ADRs)

| ADR | Entscheidung | Begruendung | Datum |
|-----|-------------|-------------|-------|
| ADR-FC-001 | Firecrawl SDK als peerDependency, nicht dependency | Vermeidet Install fuer Nutzer die kein Firecrawl brauchen. Gleiches Pattern wie OpenAI SDK. | 2026-03-29 |
| ADR-FC-002 | PlaywrightFetcher als separate Klasse, BrowserAdapter bleibt unveraendert | BrowserAdapter ist fuer langlebige Sessions (Pool, Context-Management). PlaywrightFetcher ist fire-and-forget. Unterschiedliche Lifecycles. | 2026-03-29 |
| ADR-FC-003 | SSRF-Fix vor Feature-Implementation | Security > Features. Ein SSRF in Production wuerde den gesamten Pitch-Wert zerstoeren. 2 Tage Investment fuer dauerhafte Absicherung. | 2026-03-29 |
| ADR-FC-004 | Markdown-Context in Phase 4, nicht Phase 2 | Feature-Creep vermeiden. Basis muss erst stabil laufen. Markdown ist +1-3pp F1 wert, aber nur wenn die Pipeline steht. | 2026-03-29 |
| ADR-FC-005 | DNS-Resolution-Check statt nur Pattern-Matching fuer SSRF | Pattern-Matching wird IMMER umgangen (Dezimal-IPs, URL-Encoding). DNS-Resolution prueft die tatsaechliche IP nach Aufloesung. Einzig robuster Schutz. | 2026-03-29 |
| ADR-FC-006 | Vision-Verification als P3/opt-in statt P1/default | Kosten ($0.02/Call) und Latenz (+2-3s) ueberwiegen den Nutzen fuer die meisten Use-Cases. Power-User koennen es aktivieren. | 2026-03-29 |
| ADR-FC-007 | ENGINEER-Schaetzung (12.5h) gilt, ARCHITECT-Schaetzung (19h) inkl. Refactor | ENGINEER-Schaetzung fuer reine Implementation ist praeziser. Playwright-Refactor ist optional und getrennt planbar. | 2026-03-29 |

---

## 11. ERFOLGSKRITERIEN

### Milestone 1: MVI (Tag 34)
- [ ] `analyzeFromURL('https://github.com/login')` gibt Endpoints zurueck
- [ ] SSRF: `analyzeFromURL('http://169.254.169.254/')` wird rejected
- [ ] Key-Leak: Kein Firecrawl API Key in Logs oder Error-Responses
- [ ] Cost: Firecrawl-Calls werden gezaehlt und limitiert
- [ ] CI: `npm run build && npm test` gruen

### Milestone 2: V1 (Tag 38)
- [ ] Playwright-Fallback funktioniert wenn kein Firecrawl Key
- [ ] Auto-Detection waehlt richtigen Fetcher
- [ ] HTML-Kommentare werden vor LLM-Call entfernt
- [ ] Credentials in Endpoint-Output werden redacted
- [ ] Optional: Markdown-Context verbessert F1 um mindestens +1pp (A/B Benchmark)

### Milestone 3: Public Release (Tag 42)
- [ ] v0.7.0 published auf npm
- [ ] Integration-Beispiel lauffaehig in <2 Minuten
- [ ] Security-Guide dokumentiert
- [ ] CHANGELOG aktualisiert
- [ ] Optional: Vision-Verification opt-in funktioniert

---

*Plan erstellt: 2026-03-29, COORDINATOR*
*Reviewed by: ENGINEER (Aufwand), SECURITY (Priorities), AI_ENGINEER (ML Tasks), STRATEGIST (Timeline)*
*Naechster Review: Tag 31 (nach Phase 0 Gate)*
