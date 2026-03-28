# Team-Analyse Report -- Tag 29 (28. Maerz 2026)

> Synthese der 4 Agent-Reports: ARCHITECT, AI_ENGINEER, STRATEGIST, SECURITY
> Erstellt: QA Agent | Basiert auf: SESSION-HANDOFF-TAG28, SPRINT-PLAN-TAG28-45-V2, ERRORS.md

---

## Findings nach Prioritaet

### CRITICAL

| # | Finding | Agent | Status |
|---|---------|-------|--------|
| 1 | **API-Key nicht rotiert** -- OpenAI Key seit Projektstart unveraendert. Exposure-Risiko bei jedem Commit/Log. | SECURITY | OFFEN (T-001, manuell) |
| 2 | **Post-Processing Pipeline war toter Code** (ERR-011) -- `applySiteSpecificCorrections()` wurde nie aufgerufen. 6 Korrekturregeln (Booking, OneTrust, Zendesk) ohne Wirkung. | ARCHITECT | GEFIXT (cce1afb) |

### HIGH

| # | Finding | Agent | Status |
|---|---------|-------|--------|
| 3 | **WebSocket API-Key in Query-Param** (SEC-003) -- Key sichtbar in Logs/Proxies. | SECURITY | GEFIXT (c36fae5) |
| 4 | **WebSocket Timing-Attack** (SEC-002) -- String-Vergleich statt timing-safe compare. | SECURITY | GEFIXT (701a2ff) |
| 5 | **Fehlende HSTS + CSP Headers** (SEC-004/005) -- Kein HSTS, kein CSP, path-to-regexp ReDoS. | SECURITY | GEFIXT (450b9ea) |
| 6 | **8 von 28 False Negatives sind GT-Fehler** -- Pipeline wird gegen falsche Ground-Truth optimiert. auth/navigation-Ambiguitaet bei Sign-Up, checkout/commerce bei E-Commerce. | AI_ENGINEER | OFFEN (T-009) |
| 7 | **Single-Run Varianz +/-4pp** -- F1 schwankt zwischen 61-74% je nach Run. 3-Run Mean ist Pflicht fuer Entscheidungen. | AI_ENGINEER | OFFEN (T-008) |
| 8 | **Benchmark stddev() nutzt Populations-Varianz** (ERR-013) -- Division durch N statt N-1. Bei N=3 wird Streuung um ~33% unterschaetzt. | QA | GEFIXT (diese Session) |

### MEDIUM

| # | Finding | Agent | Status |
|---|---------|-------|--------|
| 9 | **WebMCP (W3C/Chrome 146) veraendert Markt** -- Google/Microsoft Standard fuer maschinenlesbare Website-APIs. BALAGE muss sich als Bridge positionieren. | STRATEGIST | OFFEN (T-025/026) |
| 10 | **browser-use 85k Stars** -- Groesstes Framework im Zielmarkt. Integration-Beispiel hat hoechstes Sichtbarkeits-Potenzial. | STRATEGIST | OFFEN (T-032) |
| 11 | **AgentQL als direkter Konkurrent** -- Query Language + Playwright. Aehnlicher Ansatz, andere Ausfuehrung. | STRATEGIST | Beobachten |
| 12 | **Kein Hold-Out-Set** -- Alle 20 Sites werden fuer Tuning verwendet. Overfitting nicht messbar. | AI_ENGINEER | OFFEN (T-010) |
| 13 | **CART_EVIDENCE Regex zu breit** (ERR-007/012) -- "bag" und "checkout" matchen auf CSS-Klassen und Travel-Daten. | ENGINEER | GEFIXT |

---

## F1-Roadmap

| Zeitpunkt | Massnahme | Erwartetes F1 | pp-Delta | Status |
|-----------|-----------|---------------|----------|--------|
| Tag 28 (IST) | Post-Processing-Fix (ERR-011) | ~72-74% (Single-Run) | +4-6pp erwartet | DONE |
| Tag 29 | GT-Audit (8 Fehler korrigieren) | 78-83% (3-Run) | +3-5pp | OFFEN |
| Tag 30 | Structured Outputs (OpenAI JSON Schema) | 83-86% | +1-3pp | OFFEN |
| Tag 30 | Adaptive Type-Caps | +2-3pp additiv | +2-3pp | OFFEN |
| Tag 31 | Cross-Segment Evidence Sharing | 84-87% Train | +2-3pp | OFFEN |
| Sprint-Ende | **Zielkorridor** | **83-86% Train / 79-83% Hold-Out** | - | - |

---

## Aktionsplan

### Sofort (Tag 29)

1. **T-001: API-Key rotieren** -- MANUELL, OpenAI Dashboard. CRITICAL, keine Abhaengigkeit.
2. **T-008: 3-Run Benchmark** -- Zuverlaessige F1-Baseline nach Post-Processing-Fix + stddev-Fix.
3. **T-009: GT-Audit** -- 8 identifizierte Fehler korrigieren. Groesster verbleibender F1-Hebel.
4. **T-010: Hold-Out-Set definieren** -- 5 Sites reservieren, nie fuer Tuning nutzen.

### Woche 1 Rest (Tag 30-34)

5. **T-014: Structured Outputs** -- Varianz-Reduktion durch JSON Schema Enforcement.
6. **T-016: Adaptive Type-Caps** -- Login-Sites vs Content-Sites unterschiedlich cappen.
7. **T-017/018: SSO Few-Shot + Label-Synonym Dedup** -- Schnelle Precision-Gewinne.

### Woche 2 (Tag 35-41): Ship

8. **npm publish v0.7.0** mit allen Core-Fixes.
9. **browser-use + Stagehand Integration-Beispiele** erstellen.
10. **README ueberarbeiten** mit WebMCP-Positionierung.

### Woche 3 (Tag 42-45): Distribute

11. **Show HN + Blog-Post** vorbereiten und publizieren.
12. **Anthropic Startup-Programm** bewerben.
13. **Danny reaktivieren** mit Integration-Demo.

---

## Quality Gates

- **Vor jedem Benchmark:** stddev mit Bessel's Correction (N-1), mindestens 3 Runs
- **Vor npm publish:** F1 >= 80% (3-Run Train), Hold-Out dokumentiert, Security-Scan sauber
- **Vor Distribution:** README aktuell, Integration-Beispiele getestet, Smoke Tests definiert

---

*Erstellt: 2026-03-28 | QA Agent | Basiert auf 4 Agent-Reports + Sprint-Plan V2*
