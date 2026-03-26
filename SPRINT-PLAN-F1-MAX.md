# Sprint-Plan: F1 Maximierung — Agent-Team Vollbesetzung

> Basierend auf: F1-MASTER-PLAN.md (22 Findings) + Code-Verifizierung gegen Ist-Stand
> Erstellt: 2026-03-25
> Ziel: F1 59.7% → 75%+ (Overall), Phase-1 68.1% → 85%+

---

## Ist-Zustand (Baseline 2026-03-25)

| Metrik | Wert |
|--------|------|
| Overall F1 | **59.7%** |
| Overall Precision | 68.6% |
| Overall Recall | 57.9% |
| Phase-1 F1 | **68.1%** |
| Phase-1 Precision | 69.2% |
| Phase-1 Recall | 76.7% |
| Type Accuracy | 89% |
| Sites getestet | 20/20 |
| LLM-Kosten/Run | $0.107 |
| Laufzeit | 357s |

**Kernproblem:** Recall (57.9%) ist der schwaecher Faktor. Der Master-Plan fokussiert 4/6 Tier-1-Fixes auf Precision — das ist unbalanciert. Dieser Sprint korrigiert das.

---

## Architektur-Prinzipien fuer diesen Sprint

1. **Messen → Fixen → Messen** — Nie zwei fundamentale Aenderungen ohne Benchmark dazwischen
2. **GT-Korrektheit vor Pipeline-Optimierung** — Falsche Ground-Truth verzerrt alle Metriken
3. **Bug-Fixes vor Feature-Arbeit** — Invertierter Children-Filter entfernt Text den das LLM braucht
4. **DOM-Pruner zuerst** — Aendert den LLM-Input fundamental, alle nachfolgenden Schaetzungen haengen davon ab
5. **F1-Impacts sind NICHT additiv** — Jeder Fix aendert die Baseline fuer den naechsten

---

## Sprint-Phasen

### PHASE 0: Fundament (Messung bereinigen)
**Ziel:** Saubere Baseline ohne GT-Fehler und Mess-Artefakte
**Dauer:** 2h
**Agents:** QA, AI_ENGINEER

| # | Task | Agent | Datei(en) | Aufwand | Verifiziert? |
|---|------|-------|-----------|---------|-------------|
| 0.1 | GT-Korrekturen durchfuehren | QA | ground-truth/*.json | 30 min | Ja — Fix 10 im Plan |
| 0.2 | Children-Filter Bug fixen | ENGINEER | html-to-dom.ts:217 | 5 min | Ja — Bug bestaetigt |
| 0.3 | matchedSegment Bug fixen | ENGINEER | analyze.ts:237 | 15 min | Ja — Bug bestaetigt |
| 0.4 | llmCalls Zaehlung korrigieren | ENGINEER | analyze.ts:149 | 5 min | Ja — Bug bestaetigt |
| 0.5 | Benchmark laufen lassen → Baseline P0 | QA | benchmark-runner.ts | 10 min | — |

**Details Phase 0:**

**0.1 — GT-Korrekturen (QA)**
```
google-accounts.json: "Password Step" + "Forgot Password" → phase: 2 (nicht phase: 1)
amazon-de-main.json: Cookie Consent type "form" → "consent"
angular-material-demo.json: "Theme Toggle" type "navigation" → "settings"
```
QA muss ALLE 20 GTs gegen die Live-Sites pruefen und weitere Fehler dokumentieren.

**0.2 — Children-Filter Bug (ENGINEER)**
```typescript
// VORHER (FALSCH — entfernt Text-Nodes MIT Content):
children: children.filter(c => c.tagName !== "#text" || !c.textContent)

// NACHHER (RICHTIG — entfernt leere Text-Nodes):
children: children.filter(c => c.tagName !== "#text" || c.textContent)
```

**0.3 — matchedSegment Bug (ENGINEER)**
```typescript
// VORHER (FALSCH — matcht per Type, falsche Segment-Zuordnung):
const matchedSegment = segments.find(s => s.type === c.type) ?? segments[0];

// NACHHER (RICHTIG — matcht per Segment-ID):
const matchedSegment = segments.find(s => s.id === c.segmentId) ?? segments[0];
```
ACHTUNG: Pruefen ob `c.segmentId` existiert. Falls nicht, muss die ID beim Erzeugen der Candidates mitgegeben werden.

**0.4 — llmCalls Zaehlung (ENGINEER)**
```typescript
// VORHER (FALSCH — zaehlt alle interaktiven Segmente):
llmCalls = segments.filter(s => s.interactiveElementCount >= 1).length;

// NACHHER (RICHTIG — zaehlt tatsaechliche LLM-aufgerufene Segmente):
llmCalls = candidates.length; // oder filteredSegments.length aus endpoint-generator
```

---

### PHASE 1: Information-Gain (LLM-Input verbessern)
**Ziel:** Dem LLM die Signale zurueckgeben die der DOM-Pruner heute vernichtet
**Dauer:** 4h
**Agents:** AI_ENGINEER, ENGINEER, ARCHITECT

| # | Task | Agent | Datei(en) | Aufwand | Erwarteter Lift |
|---|------|-------|-----------|---------|----------------|
| 1.1 | DOM-Pruner: class/id/name semantisch behalten | AI_ENGINEER | dom-pruner.ts:240-261 | 2h | +4-6pp F1 |
| 1.2 | aria-hidden Bug fixen | ENGINEER | html-to-dom.ts:196-201 | 10 min | +0.5-1.5pp F1 |
| 1.3 | Framework-Detection an LLM-Prompt weiterleiten | AI_ENGINEER | analyze.ts:215, prompts.ts | 1h | +1-2pp F1 |
| 1.4 | autocomplete-Tokens erweitern | ENGINEER | analyze.ts:329 | 30 min | +1-2pp F1 |
| 1.5 | Benchmark laufen lassen → Baseline P1 | QA | benchmark-runner.ts | 10 min | — |

**Details Phase 1:**

**1.1 — DOM-Pruner Semantische Attribute (AI_ENGINEER)**
WICHTIGSTER FIX IM GESAMTEN SPRINT.

Das LLM sieht aktuell nie `class="login-form"`, `id="search-box"`, `name="password"`.
Das ist der groesste Information-Loss im System.

Strategie:
```typescript
// class: Nur semantische Keywords behalten, Utility-Klassen filtern
const SEMANTIC_CLASS_KEYWORDS = new Set([
  "login", "signin", "signup", "register", "auth", "password",
  "search", "cart", "basket", "checkout", "nav", "menu", "header", "footer",
  "cookie", "consent", "gdpr", "privacy", "banner", "modal", "dialog",
  "product", "price", "form", "submit", "contact", "support",
  "settings", "profile", "account", "dashboard",
]);

const UTILITY_CLASS_PREFIXES = ["bg-", "text-", "p-", "m-", "px-", "py-",
  "mx-", "my-", "w-", "h-", "flex-", "grid-", "col-", "row-",
  "sm:", "md:", "lg:", "xl:", "2xl:", "hover:", "focus:", "dark:",
];

// Fuer jede class: Nur Keywords behalten die in SEMANTIC_CLASS_KEYWORDS matchen
// id: Behalten wenn es semantische Keywords enthaelt
// name: Immer behalten fuer Inputs (password, email, q, search, username)
```

ARCHITECT muss die Grenze definieren: Welche Keywords sind semantisch relevant?
AI_ENGINEER implementiert den Filter.
Token-Budget pruefen — class/id/name erhoehen den Token-Verbrauch.

**1.2 — aria-hidden Bug (ENGINEER)**
```typescript
// VORHER (FALSCH — aria-hidden versteckt nur vom Screen-Reader, nicht visuell):
const isHidden = attributes["hidden"] !== undefined
  || attributes["aria-hidden"] === "true"   // ← ENTFERNEN
  || (attributes["style"] ?? "").includes("display:none")
  ...

// NACHHER (RICHTIG):
const isHidden = attributes["hidden"] !== undefined
  || (attributes["style"] ?? "").includes("display:none")
  || (attributes["style"] ?? "").includes("display: none")
  || attributes["type"] === "hidden";
```

**1.3 — Framework-Detection an LLM weiterleiten (AI_ENGINEER)**
`detect-framework.ts` erkennt Frameworks korrekt, aber das Ergebnis wird nie an den LLM-Prompt uebergeben.

```typescript
// In analyze.ts: framework an generateEndpoints() uebergeben
candidates = await generateEndpoints(
  segments,
  { url, siteId: url, sessionId: randomUUID(), framework: frameworkResult },
  { llmClient, maxConcurrency: 6 },
);

// In prompts.ts: Framework-Hint in System-Prompt einfuegen
if (context.framework) {
  parts.push(`## Site Context`);
  parts.push(`Detected framework: ${context.framework.name} (confidence: ${context.framework.confidence})`);
  parts.push(`This is likely a ${inferSiteType(context.framework.name)} site.`);
}
```

**1.4 — autocomplete-Tokens erweitern (ENGINEER)**
Basis (email) existiert. Fehlende hochpraezise Tokens:
```typescript
// In collectDomSignals():
const ac = attrs["autocomplete"] ?? "";
if (ac.includes("current-password") || ac.includes("new-password")) {
  signals.hasPasswordInput = true;
}
if (ac.includes("cc-number") || ac.includes("cc-exp") || ac.includes("cc-csc")) {
  signals.hasPaymentInput = true;  // Neues Signal
}
if (ac.includes("username")) {
  signals.hasUsernameInput = true;  // Neues Signal
}
```

---

### PHASE 2: Precision-Haertung (False Positives reduzieren)
**Ziel:** LLM-Halluzinationen und Over-Detection eliminieren
**Dauer:** 4h
**Agents:** AI_ENGINEER, ENGINEER, QA

| # | Task | Agent | Datei(en) | Aufwand | Erwarteter Lift |
|---|------|-------|-----------|---------|----------------|
| 2.1 | Hallucination-Checks auf alle Typen erweitern | AI_ENGINEER | endpoint-generator.ts:416-434 | 2h | +2-3pp Precision |
| 2.2 | TYPE_ALIASES um "settings" erweitern | QA | benchmark-runner.ts:129-139 | 10 min | +1-2pp F1 |
| 2.3 | Negative Few-Shot Example | AI_ENGINEER | prompts.ts | 1h | +1-2pp Precision |
| 2.4 | Consent-Detection ohne role=dialog | ENGINEER | analyze.ts:373-380 | 30 min | +0.5-1pp Recall |
| 2.5 | Benchmark laufen lassen → Baseline P2 | QA | benchmark-runner.ts | 10 min | — |

**Details Phase 2:**

**2.1 — Hallucination-Checks erweitern (AI_ENGINEER)**
Aktuell nur 3 Typen geprueft (search, auth, checkout). Fehlende Checks:

```typescript
// commerce: Kein Preis/Produkt → penalize
const hasCommerceEvidence = /price|product|add.to.cart|buy|purchase|kaufen|warenkorb|\$|€|£/i.test(segText);
if (candidate.type === "commerce" && !hasCommerceEvidence) {
  candidate.confidence *= 0.5;
}

// consent: Kein Cookie/GDPR-Text → penalize
const hasConsentEvidence = /cookie|consent|gdpr|privacy|datenschutz|tracking|accept.*all/i.test(segText);
if (candidate.type === "consent" && !hasConsentEvidence) {
  candidate.confidence *= 0.5;
}

// settings: Kein Toggle/Switch/Select → penalize
const hasSettingsEvidence = /toggle|switch|select|preference|setting|einstellung|theme|language|sprache/i.test(segText)
  || /type="?checkbox|type="?radio|role="?switch/.test(segText);
if (candidate.type === "settings" && !hasSettingsEvidence) {
  candidate.confidence *= 0.6;
}

// navigation: Kein <nav> oder Links → penalize (nur wenn aus nicht-nav Segment)
const hasNavEvidence = /<nav|<a |role="?navigation|role="?menubar/i.test(segText);
if (candidate.type === "navigation" && segment.type !== "navigation" && !hasNavEvidence) {
  candidate.confidence *= 0.6;
}
```

**2.2 — TYPE_ALIASES "settings" (QA)**
```typescript
const TYPE_ALIASES: Record<string, string[]> = {
  // ... bestehende Aliases ...
  settings: ["settings", "navigation", "consent"],
  navigation: ["navigation", "content", "settings"],  // settings hinzufuegen
  consent: ["consent", "form", "settings"],            // settings hinzufuegen
};
```

**2.3 — Negative Few-Shot Example (AI_ENGINEER)**
Ein Example das zeigt: "Dieser Footer hat 0 Endpoints":
```typescript
{
  input: `<footer>\n  <div>\n    <a href="/about">About</a>\n    <a href="/terms">Terms</a>\n    <a href="/privacy">Privacy</a>\n    <a href="/contact">Contact</a>\n  </div>\n  <p>© 2024 Example Corp</p>\n</footer>`,
  output: {
    endpoints: [],
    reasoning: "This is a standard footer with static links. No interactive endpoints detected — these are informational navigation links, not functional endpoints."
  }
}
```

**2.4 — Consent-Detection erweitern (ENGINEER)**
```typescript
// VORHER: Nur role=dialog/alertdialog + Keywords
// NACHHER: Auch ohne role, via id/class Pattern
if (
  (role === "dialog" || role === "alertdialog" ||
   /cookie|consent|gdpr|privacy|banner/i.test(attrs["id"] ?? "") ||
   /cookie|consent|gdpr|privacy|banner/i.test(attrs["class"] ?? ""))
  && (/cookie|consent|gdpr|privacy/i.test(
    [attrs["aria-label"] ?? "", node.textContent ?? ""].join(" "),
  ))
) {
  signals.hasCookieConsent = true;
}
```

---

### PHASE 3: Pipeline-Intelligenz (Systemische Verbesserungen)
**Ziel:** Klassifizierung konsolidieren, Token-Effizienz, Cross-Segment Dedup
**Dauer:** 6h
**Agents:** ARCHITECT, AI_ENGINEER, ENGINEER

| # | Task | Agent | Datei(en) | Aufwand | Erwarteter Lift |
|---|------|-------|-----------|---------|----------------|
| 3.1 | Heuristik-Klassifizierung konsolidieren | ARCHITECT + ENGINEER | analyze.ts, endpoint-classifier.ts | 3h | +2-3pp F1 |
| 3.2 | Selektive Few-Shot Examples | AI_ENGINEER | prompts.ts:330-349 | 1h | -30% Tokens |
| 3.3 | Pre-LLM Evidence Summary im Prompt | AI_ENGINEER | prompts.ts, endpoint-generator.ts | 1h | +1-2pp F1 |
| 3.4 | Cross-Segment Similarity-Dedup | ENGINEER | analyze.ts:689-704 | 1h | +1-2pp Precision |
| 3.5 | Benchmark laufen lassen → Baseline P3 | QA | benchmark-runner.ts | 10 min | — |

**Details Phase 3:**

**3.1 — Heuristik-Klassifizierung konsolidieren (ARCHITECT plant, ENGINEER baut)**
Zwei separate Klassifizierungslogiken:
- `analyze.ts:inferEndpointType()` (Zeile 573-604) — Pure Heuristik
- `endpoint-classifier.ts:classifyEndpoint()` (Zeile 226-288) — LLM + Heuristik-Korrekturen

ARCHITECT entscheidet: Eine Logik, zwei Aufrufpfade? Oder eine Engine mit Heuristik-Only vs. LLM-Enhanced Mode?

Empfehlung: `endpoint-classifier.ts` wird die Single Source of Truth.
`inferEndpointType()` wird ein Thin Wrapper der `classifyEndpoint()` im Heuristik-Only-Modus aufruft.

**3.2 — Selektive Few-Shot Examples (AI_ENGINEER)**
Aktuell: 5 Examples werden IMMER alle gesendet (~1500+ Tokens).
Besser: Basierend auf Segment-Typ nur 1-2 relevante Examples senden.

```typescript
function selectExamples(segmentType: string): FewShotExample[] {
  const relevant = ENDPOINT_EXTRACTION_FEW_SHOT.filter(ex =>
    ex.relevantTypes.includes(segmentType)
  );
  return relevant.slice(0, 2); // Max 2 Examples
}
```

**3.3 — Pre-LLM Evidence Summary (AI_ENGINEER)**
Dem LLM sagen was die Heuristik schon gefunden hat:
```typescript
parts.push("## Pre-Analysis Evidence");
parts.push(`Heuristic signals detected:`);
if (signals.hasPasswordInput) parts.push("- Password input found → likely auth");
if (signals.hasSearchInput) parts.push("- Search input found → likely search");
if (signals.hasCookieConsent) parts.push("- Cookie consent indicators found");
if (signals.hasPaymentInput) parts.push("- Payment fields found → likely checkout");
parts.push("Use these signals to guide your analysis, but verify against the DOM.");
```

**3.4 — Cross-Segment Similarity-Dedup (ENGINEER)**
Aktuell: Nur exakte `type:label` String-Matches.
Besser: Levenshtein-Distanz oder Normalized-Token-Overlap.

```typescript
function isSimilarEndpoint(a: DetectedEndpoint, b: DetectedEndpoint): boolean {
  if (a.type !== b.type) return false;
  const similarity = tokenOverlap(a.label.toLowerCase(), b.label.toLowerCase());
  return similarity >= 0.6; // "Main Navigation" vs "Site Navigation" = merge
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  return intersection / Math.max(tokensA.size, tokensB.size);
}
```

---

### PHASE 4: Micro-Optimierungen & Haertung
**Ziel:** Letzte Prozentpunkte, Performance, Robustheit
**Dauer:** 4h
**Agents:** ENGINEER, QA, PLATFORM, SECURITY

| # | Task | Agent | Datei(en) | Aufwand | Erwarteter Lift |
|---|------|-------|-----------|---------|----------------|
| 4.1 | ariaRolesMatchType Map vervollstaendigen | ENGINEER | endpoint-classifier.ts | 30 min | +0.5pp |
| 4.2 | Deutsche Commerce-Labels | ENGINEER | Heuristiken | 30 min | +0.5pp |
| 4.3 | formAction-Regex erweitern | ENGINEER | analyze.ts | 15 min | +0.5pp |
| 4.4 | Search-Evidence Regex erweitern | ENGINEER | endpoint-generator.ts | 15 min | +0.5pp |
| 4.5 | Dedup-Threshold senken (0.40→0.30) | ENGINEER | analyze.ts | 5 min | +0.5pp |
| 4.6 | DOM-Traversal konsolidieren (Performance) | ENGINEER | endpoint-classifier.ts:360 | 2h | +15-20% Speed |
| 4.7 | Framework-Detection Quick-Check | ENGINEER | detect-framework.ts:93 | 30 min | +20-30% Speed |
| 4.8 | Security Review aller Aenderungen | SECURITY | Alle geaenderten Dateien | 1h | — |
| 4.9 | Regressions-Tests schreiben | QA | tests/ | 2h | — |
| 4.10 | Final Benchmark → Ergebnis dokumentieren | QA | benchmark-runner.ts | 15 min | — |

---

## Agent-Zuweisungen (Gesamtuebersicht)

### COORDINATOR
- Sprint-Steuerung, Abhaengigkeiten tracken
- Nach jeder Phase: Go/No-Go Entscheidung basierend auf Benchmark-Ergebnissen
- Wenn Phase N weniger Lift bringt als erwartet: Re-Priorisierung

### ARCHITECT
- Phase 0: Review der GT-Korrekturen
- Phase 1: Semantische Keyword-Liste fuer DOM-Pruner definieren
- Phase 3: Architektur-Entscheidung Heuristik-Konsolidierung
- Schreibt KEINEN Code

### AI_ENGINEER
- Phase 1: DOM-Pruner Semantik (HAUPTAUFGABE), Framework→LLM Weiterleitung
- Phase 2: Hallucination-Checks, Negative Few-Shot
- Phase 3: Selektive Examples, Pre-LLM Evidence Summary
- Fokus: Alles was LLM-Input/Output-Qualitaet betrifft

### ENGINEER
- Phase 0: Bug-Fixes (Children-Filter, matchedSegment, llmCalls)
- Phase 1: aria-hidden, autocomplete-Tokens
- Phase 2: Consent-Detection
- Phase 3: Heuristik-Konsolidierung (nach ARCHITECT-Plan), Cross-Segment Dedup
- Phase 4: Micro-Optimierungen, Performance
- Fokus: Saubere Implementation, keine eigenen Design-Entscheidungen

### QA
- Phase 0: GT-Korrekturen, Baseline-Benchmark
- Phase 2: TYPE_ALIASES
- Phase 4: Regressions-Tests, Final-Benchmark
- Nach JEDER Phase: Benchmark laufen lassen + Ergebnis dokumentieren
- Fokus: Messung, Korrektheit, kein Feature darf Regression verursachen

### SECURITY
- Phase 4: Review aller Aenderungen (Regex-Injections, Input-Sanitization)
- Prueft: Neue Regex-Patterns auf ReDoS-Anfaelligkeit
- Prueft: class/id/name Attribute auf XSS-Vektoren im LLM-Output

### PLATFORM
- Phase 4: Performance-Monitoring der Aenderungen
- Prueft: Token-Verbrauch vor/nach DOM-Pruner-Aenderung
- Prueft: Laufzeit-Regression durch zusaetzliche Attribute

### STRATEGIST
- Post-Sprint: Ergebnisse bewerten
- Frage: Lohnt sich Tier 3+4 oder ist das Diminishing Returns?
- Frage: Ab welchem F1 ist die Lib "production-ready" fuer Framework-Integration?

---

## Erwartete Ergebnisse (konservativ, nicht-additiv geschaetzt)

| Phase | Erwarteter F1 (Overall) | Erwarteter F1 (Phase-1) | Kumulierter Aufwand |
|-------|------------------------|------------------------|---------------------|
| Baseline | 59.7% | 68.1% | 0h |
| Phase 0 | 62-64% | 70-73% | 2h |
| Phase 1 | 67-72% | 76-80% | 6h |
| Phase 2 | 70-75% | 79-83% | 10h |
| Phase 3 | 72-77% | 81-85% | 16h |
| Phase 4 | 73-78% | 82-86% | 20h |

**Minimum-Ziel: 72% Overall, 80% Phase-1 nach Phase 3**
**Stretch-Ziel: 78% Overall, 86% Phase-1 nach Phase 4**

---

## Abhaengigkeitsgraph

```
Phase 0 (GT + Bugs)
    │
    ▼
Phase 1 (DOM-Pruner + LLM-Input)  ← FUNDAMENTALE AENDERUNG, danach neu messen
    │
    ├──► Phase 2 (Precision)  ── parallel moeglich ──► Phase 3 (Pipeline)
    │                                                       │
    └───────────────────────────────────────────────────────▼
                                                      Phase 4 (Haertung)
```

Phase 2 und 3 koennen TEILWEISE parallel laufen:
- 2.1 (Hallucination-Checks) und 3.2 (Selektive Examples) sind unabhaengig
- 2.4 (Consent-Detection) und 3.4 (Dedup) sind unabhaengig
- 3.1 (Heuristik-Konsolidierung) MUSS vor 3.3 (Evidence Summary) kommen

---

## Go/No-Go Kriterien

| Checkpoint | Minimum | Aktion wenn verfehlt |
|-----------|---------|---------------------|
| Nach Phase 0 | F1 >= 61% | Wenn schlechter: GT hat noch Fehler, QA prueft |
| Nach Phase 1 | F1 >= 66% | Wenn schlechter: DOM-Pruner Token-Budget zu knapp → erweitern |
| Nach Phase 2 | F1 >= 70% | Wenn schlechter: Phase 3 priorisiert Recall statt Pipeline |
| Nach Phase 3 | F1 >= 72% | Wenn schlechter: STRATEGIST bewertet ob Phase 4 lohnt |

---

## Risiken und Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| DOM-Pruner erhoehlt Token-Verbrauch ueber Budget | Hoch | Mittel | Token-Counting vor/nach, Keyword-Liste restriktiv halten |
| Neue Attribute konfusieren das LLM | Mittel | Hoch | A/B-Test: 5 Sites mit/ohne neue Attribute |
| GT-Korrekturen decken weitere Fehler auf | Hoch | Niedrig | Alle 20 GTs systematisch reviewen, nicht nur 3 |
| Hallucination-Checks zu aggressiv → Recall sinkt | Mittel | Mittel | Confidence-Multiplikatoren konservativ starten (0.6 statt 0.5) |
| Heuristik-Konsolidierung bricht bestehende Logik | Niedrig | Hoch | ARCHITECT plant, ENGINEER baut, QA testet — vor Merge Benchmark |

---

## Definition of Done

- [ ] F1 >= 72% (Overall) auf 20 Real-World Sites
- [ ] F1 >= 80% (Phase-1) auf 20 Real-World Sites
- [ ] Keine Regression auf einzelnen Sites > 5pp F1
- [ ] Token-Verbrauch pro Run <= $0.15 (aktuell $0.107)
- [ ] Laufzeit pro Run <= 400s (aktuell 357s)
- [ ] Alle Bug-Fixes haben Unit-Tests
- [ ] Security Review bestanden
- [ ] ERRORS.md aktualisiert mit allen gefundenen/gefixten Bugs
- [ ] Benchmark-Ergebnisse pro Phase dokumentiert

---

*Sprint erstellt: 2026-03-25*
*Naechste Aktion: COORDINATOR startet Phase 0*
