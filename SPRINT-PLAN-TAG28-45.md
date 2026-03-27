# Sprint-Plan Tag 28-45: Distribution Sprint

> Erstellt: 2026-03-27 | Koordiniert von: COORDINATOR
> Synthese aus 5 Agent-Reports: ARCHITECT, AI_ENGINEER, STRATEGIST, SECURITY, PLATFORM
> Leitprinzip: **Distribution first. Keine Features ohne Nutzer-Feedback.**

---

## Strategische Praemissen

1. **STRATEGIST-Warnung ist das Leitprinzip.** Risiko-Score 20 bei "kein Nutzer bis Tag 45". Jeder Tag ohne Distribution-Arbeit ist verschwendet.
2. **F1 78.5% reicht fuer Early Adopter.** Perfektion kommt nach erstem Nutzer-Feedback, nicht davor.
3. **Security-Findings blocken Distribution.** CRITICAL + HIGH muessen vor jedem oeffentlichen Push gefixt sein.
4. **Tech-Arbeit nur mit Distribution-ROI.** Jede technische Aufgabe muss die Frage beantworten: "Hilft das einem Nutzer in den naechsten 2 Wochen?"

### Zeitbudget (17 Tage)

| Kategorie | Anteil | Tage | Begruendung |
|-----------|--------|------|-------------|
| Distribution | 55% | ~9.5 | Nutzer finden, Content, Outreach |
| Tech (Quick Wins) | 20% | ~3.5 | Security, Precision, Package-Fixes |
| Infrastruktur | 10% | ~1.5 | npm publish pipeline, README, Quick Start |
| Funding/Partnerships | 10% | ~1.5 | Danny reaktivieren, Integration-Partner |
| Buffer | 5% | ~1 | Unerwartetes |

---

## Woche 1: Foundation + First Distribution (Tag 28-34)

### Tag 28 (Freitag) — SECURITY BLOCKER FIX

> Nichts geht oeffentlich raus bevor die CRITICAL + HIGH Findings geloest sind.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-001 | API-Key rotieren (.env.local) | PLATFORM | - | Neuer Key aktiv, alter Key deaktiviert, .env.local in .gitignore validiert |
| T-002 | Security Headers setzen (Fastify) | ENGINEER | - | X-Content-Type, X-Frame-Options, Strict-Transport-Security, CSP |
| T-003 | Body-Size-Limit auf Fastify-Server | ENGINEER | - | 1MB Default-Limit, konfigurierbar |
| T-004 | npm audit fix | PLATFORM | - | 0 high/critical vulnerabilities |
| T-005 | .env.example erstellen (ohne echte Werte) | PLATFORM | T-001 | Template-Datei committed |

**Quality Gate Tag 28:**
- [ ] `npm audit` zeigt 0 critical/high
- [ ] Alter API-Key deaktiviert
- [ ] Security Headers auf Demo-Server aktiv
- [ ] Kein Secret in Git-History (ggf. BFG-Cleaner)

---

### Tag 29 (Samstag) — PRECISION QUICK WINS

> Die 2 Aenderungen mit dem hoechsten F1-Hebel bei geringstem Risiko.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-006 | Dynamic SAFETY_CAP: pro-Site-Heuristik statt global=8 | AI_ENGINEER | - | Cap basiert auf Seitengroesse (Segmente/Kandidaten), erwartet +2-3pp F1 |
| T-007 | Navigation-Cap 5 auf 3 senken | AI_ENGINEER | - | Weniger FP bei Nav-Endpoints |
| T-008 | Structured Outputs aktivieren (OpenAI) | AI_ENGINEER | - | Varianz -10-15% durch erzwungenes JSON-Schema |
| T-009 | Unit-Tests fuer T-006 bis T-008 | QA | T-006, T-007, T-008 | Mindestens 10 neue Tests |
| T-010 | Benchmark laufen lassen, F1-Delta dokumentieren | QA | T-009 | Benchmark-Result JSON committed |

**Quality Gate Tag 29:**
- [ ] Alle bestehenden Tests gruen
- [ ] Benchmark F1 >= 80% (Ziel: 78.5 + 2-3pp)
- [ ] Keine Regression auf Top-Sites (Google, Typeform, HN)

---

### Tag 30 (Sonntag) — PACKAGE RELEASE PREP

> balage-core muss installierbar, dokumentiert und vertrauenswuerdig sein.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-011 | README.md ueberarbeiten: Quick Start mit 3 Beispielen (Login, Search, E-Commerce) | ENGINEER | - | README committed |
| T-012 | CHANGELOG.md erstellen (alle Versionen bis 0.5.x) | ENGINEER | - | CHANGELOG committed |
| T-013 | Bundle-Size pruefen und Tree-Shaking validieren | PLATFORM | - | Dokumentierter Bundle-Report, Ziel < 150KB |
| T-014 | DTS-Generierung automatisieren (tsup --dts statt handgeschrieben) | PLATFORM | - | Build-Script aktualisiert |
| T-015 | npm publish pipeline als GitHub Action | PLATFORM | T-014 | .github/workflows/publish.yml |
| T-016 | balage-core@0.6.0 veroeffentlichen (npm latest, nicht alpha) | PLATFORM | T-011, T-014, T-015 | Package auf npmjs.com als latest |

**Quality Gate Tag 30:**
- [ ] `npm install balage-core` funktioniert (frisches Projekt)
- [ ] Quick Start aus README laeuft in < 2 Minuten
- [ ] Bundle < 200KB (Stretch: < 150KB)
- [ ] TypeScript-Types korrekt aufgeloest

---

### Tag 31 (Montag) — DISTRIBUTION: CONTENT CREATION

> Ab heute beginnt die Distribution-Phase. Content geht vor Code.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-017 | Blog-Post 1: "Why Browser Agents Need a Semantic Layer" (dev.to) | STRATEGIST | T-016 | Draft fertig, 800-1200 Woerter |
| T-018 | Integration-Beispiel: browser-use + BALAGE (funktionierender Code) | ENGINEER | T-016 | examples/browser-use-integration/ im Repo |
| T-019 | Integration-Beispiel: Stagehand + BALAGE (funktionierender Code) | ENGINEER | T-016 | examples/stagehand-integration/ im Repo |
| T-020 | Twitter/X Thread: "Building BALAGE — Open-Source Semantic Layer for Browser Agents" | STRATEGIST | T-017 | Thread-Draft, 5-8 Tweets |

**Quality Gate Tag 31:**
- [ ] Blog-Post hat Code-Beispiel das laeuft
- [ ] Integration-Beispiele getestet und committed
- [ ] Alle Beispiele nutzen balage-core@0.6.0 von npm (nicht lokal)

---

### Tag 32 (Dienstag) — DISTRIBUTION: OUTREACH WAVE 1

> Direkte Ansprache der hoechstwertigen Zielgruppe: Browser-Agent-Builder.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-021 | Blog-Post 1 auf dev.to veroeffentlichen | STRATEGIST | T-017 | Live-URL |
| T-022 | Reddit-Posts: r/LangChain, r/MachineLearning, r/webdev (Show HN-Stil) | STRATEGIST | T-021 | 3 Posts live |
| T-023 | Danny reaktivieren: Personalisierte Nachricht mit Integration-Demo | STRATEGIST | T-018 | Nachricht gesendet |
| T-024 | browser-use GitHub: Issue/Discussion erstellen "Semantic layer integration" | ENGINEER | T-018 | Issue/Discussion URL |
| T-025 | Stagehand GitHub: Issue/Discussion erstellen | ENGINEER | T-019 | Issue/Discussion URL |

**Quality Gate Tag 32:**
- [ ] Blog-Post live mit funktionierenden Links
- [ ] Reddit-Posts nicht geloescht (Regel-konform gepostet)
- [ ] Danny hat Nachricht erhalten
- [ ] GitHub Issues/Discussions erstellt

---

### Tag 33 (Mittwoch) — DISTRIBUTION: COMMUNITY + DEMO

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-026 | Interaktive Demo: "Try BALAGE on any URL" (Fastify-Endpoint oder Stackblitz) | ENGINEER | T-016 | Live-Demo-URL |
| T-027 | Discord: AI-Agent-Communities beitreten (browser-use, LangChain, AutoGPT) | STRATEGIST | - | Accounts aktiv, Introductions gepostet |
| T-028 | Auf Reddit/Twitter Antworten und Engagement pflegen | STRATEGIST | T-021, T-022 | Alle Kommentare beantwortet |
| T-029 | Tracking einrichten: npm download stats, GitHub stars, Demo-Usage | PLATFORM | T-026 | Dashboard oder Script |

**Quality Gate Tag 33:**
- [ ] Demo-URL erreichbar und funktional
- [ ] Mindestens 3 Community-Praesenz aufgebaut

---

### Tag 34 (Donnerstag) — TECH: GT-KORPUS + EVAL INFRA

> AI_ENGINEER braucht 50+ Sites fuer signifikante Tests. Parallel zu Distribution.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-030 | 15 neue Sites fuer Ground-Truth-Korpus (Fokus: E-Commerce, SaaS-Dashboards, Government) | AI_ENGINEER | - | 35 total Sites mit GT |
| T-031 | Benchmark-Regression-Gate in CI | PLATFORM | T-015 | F1-Check in GitHub Action, fail bei > 2pp Drop |
| T-032 | Blog-Post 2: "How We Detect Login Forms with 80%+ Accuracy" (technisch) | STRATEGIST | T-010 | Draft fertig |
| T-033 | Erste Nutzer-Metriken auswerten | STRATEGIST | T-029 | Report: Downloads, Stars, Demo-Usage |

**Quality Gate Tag 34:**
- [ ] GT-Korpus auf >= 35 Sites
- [ ] CI-Pipeline hat Benchmark-Gate

---

## Woche 2: Distribution Push + Feedback Loop (Tag 35-41)

### Tag 35 (Freitag) — DISTRIBUTION: CONTENT WAVE 2

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-034 | Blog-Post 2 veroeffentlichen (dev.to + Medium) | STRATEGIST | T-032 | 2 Live-URLs |
| T-035 | HackerNews "Show HN: BALAGE — Semantic Page Analysis for Browser Agents" | STRATEGIST | T-026 | HN Post live |
| T-036 | Twitter/X Thread 2: Technical deep-dive (mit Benchmark-Zahlen) | STRATEGIST | T-010 | Thread live |
| T-037 | Product Hunt vorbereiten (Launch-Page + Assets) | STRATEGIST | T-026 | Draft auf Product Hunt |

**Quality Gate Tag 35:**
- [ ] Show HN live
- [ ] 2 Blog-Posts live

---

### Tag 36 (Samstag) — FEEDBACK INTEGRATION + TECH

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-038 | Nutzer-Feedback sammeln und kategorisieren (GitHub Issues, Reddit, Discord) | STRATEGIST | T-022, T-035 | Feedback-Report mit Top-3 Requests |
| T-039 | "Null-Result" Few-Shot fuer LLM-Prompt hinzufuegen | AI_ENGINEER | - | Weniger Halluzinationen bei leeren Seiten |
| T-040 | Segment-Budget im Prompt (max N Endpoints pro Segment) | AI_ENGINEER | - | Kontrollierte LLM-Ausgabe |
| T-041 | HN/Reddit Engagement: Alle Kommentare beantworten, technisch fundiert | STRATEGIST | T-035 | Alle Kommentare beantwortet |

**Quality Gate Tag 36:**
- [ ] Feedback-Report existiert
- [ ] LLM-Prompt-Verbesserungen getestet, F1 stabil

---

### Tag 37 (Sonntag) — PARTNERSHIP OUTREACH

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-042 | E-Mail an browser-use Team: Integration-Proposal mit funktionierendem Code | STRATEGIST | T-018 | E-Mail gesendet |
| T-043 | E-Mail an Stagehand Team (Browserbase): Integration-Proposal | STRATEGIST | T-019 | E-Mail gesendet |
| T-044 | 5 weitere Browser-Agent-Projekte identifizieren und kontaktieren | STRATEGIST | - | Outreach-Liste mit Status |
| T-045 | LaVague, AgentQL, Skyvern evaluieren als Integration-Ziele | AI_ENGINEER | - | Kompatibilitaets-Report |

**Quality Gate Tag 37:**
- [ ] 7+ Agent-Frameworks kontaktiert
- [ ] Integration-Proposals haben funktionierenden Code

---

### Tag 38 (Montag) — TECH: ARCHITECT PHASE 1 PRECISION

> Nur wenn Nutzer-Feedback das bestaetigt. Sonst Distribution weiter.

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-046 | site-specific-corrections.ts: Top-5 Regeln in generische Heuristiken umwandeln | ENGINEER | ARCHITECT-Review | 5 weniger hardcoded Regeln |
| T-047 | Post-Processing: 3 der 28 Regeln die am meisten FPs erzeugen refactoren | ENGINEER | ARCHITECT-Review | Refactored, Tests gruen |
| T-048 | GT-Korpus auf 50 Sites erweitern | AI_ENGINEER | T-030 | 50 Sites mit GT |
| T-049 | Benchmark auf 50 Sites laufen lassen, F1 dokumentieren | QA | T-048 | Benchmark-Result committed |

**Quality Gate Tag 38:**
- [ ] Site-specific-corrections.ts hat <= 23 Regeln (von 28)
- [ ] Alle Tests gruen
- [ ] 50-Site-Benchmark laeuft durch

---

### Tag 39 (Dienstag) — DISTRIBUTION: DIRECT SALES

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-050 | Top-10 Browser-Agent-Projekte auf GitHub: Star Count, Activity, Pain Points analysieren | STRATEGIST | - | Target-Liste |
| T-051 | 5 personalisierte Outreach-Messages (nicht Spam, sondern "ich habe euer Problem X geloest") | STRATEGIST | T-050 | Messages gesendet |
| T-052 | Integration-Beispiel 3: Playwright + BALAGE (ohne Agent-Framework) | ENGINEER | T-016 | examples/playwright-integration/ |
| T-053 | Blog-Post 3: "Build vs Buy: Why Not Build Your Own Page Analyzer" | STRATEGIST | - | Draft fertig |

**Quality Gate Tag 39:**
- [ ] 5 personalisierte Outreach-Messages gesendet
- [ ] Playwright-Beispiel funktioniert und committed

---

### Tag 40 (Mittwoch) — FUNDING PREP

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-054 | One-Pager: BALAGE Pitch-Deck (Problem, Solution, Traction, Ask) | STRATEGIST | T-033 | PDF/Markdown, 1 Seite |
| T-055 | Traction-Metriken zusammenstellen (npm Downloads, GitHub Stars, Demo Usage, Outreach Responses) | STRATEGIST | T-029 | Metrics-Dashboard aktualisiert |
| T-056 | 3 moegliche Revenue-Modelle ausarbeiten (Licensing, Usage-Based, Freemium) | STRATEGIST | - | Vergleichstabelle mit Unit Economics |
| T-057 | Danny Follow-Up (wenn keine Antwort auf T-023) | STRATEGIST | T-023 | Follow-Up gesendet oder Meeting vereinbart |

**Quality Gate Tag 40:**
- [ ] One-Pager fertig
- [ ] Traction-Daten aktuell

---

### Tag 41 (Donnerstag) — TECH: OBSERVABILITY + DSGVO

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-058 | Logging: pino-Transport fuer JSON-Export (Prometheus-kompatibel) | PLATFORM | - | Config-Option fuer strukturiertes Logging |
| T-059 | DSGVO-Check: Welche Daten gehen an OpenAI? HTML-Scrubbing evaluieren | SECURITY | - | Report: Welche Felder, Risiko, Empfehlung |
| T-060 | Privacy-Policy-Entwurf fuer Demo-Seite | SECURITY | T-059 | Privacy Policy Draft |
| T-061 | Injection-Detection auf nicht-englische Patterns erweitern (DE, FR, ES) | SECURITY | - | Regex-Patterns erweitert, Tests hinzugefuegt |

**Quality Gate Tag 41:**
- [ ] Strukturiertes Logging aktivierbar
- [ ] DSGVO-Report existiert
- [ ] Injection-Detection deckt DE/FR/ES ab

---

## Woche 3: Traction + Iterate (Tag 42-45)

### Tag 42 (Freitag) — DISTRIBUTION: PRODUCT HUNT + WAVE 3

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-062 | Product Hunt Launch | STRATEGIST | T-037 | Live auf Product Hunt |
| T-063 | Alle Channels bespielen: Twitter, Reddit, Discord, LinkedIn | STRATEGIST | T-062 | Cross-Posting fertig |
| T-064 | Blog-Post 3 veroeffentlichen | STRATEGIST | T-053 | Live-URL |
| T-065 | Alle Outreach-Antworten tracken und beantworten | STRATEGIST | - | CRM-Tabelle aktuell |

**Quality Gate Tag 42:**
- [ ] Product Hunt Launch live
- [ ] Alle Channels bespielt

---

### Tag 43 (Samstag) — FEEDBACK-DRIVEN ITERATION

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-066 | Nutzer-Feedback Runde 2: Kategorisieren (Feature Requests, Bugs, Integration-Wuensche) | STRATEGIST | T-065 | Priorisierte Feedback-Liste |
| T-067 | Top-1 Feature Request implementieren (wenn < 1 Tag Aufwand) | ENGINEER | T-066 | Feature committed |
| T-068 | Top-1 Bug fixen (wenn reported) | ENGINEER | T-066 | Fix committed |
| T-069 | balage-core@0.7.0 veroeffentlichen (mit Fixes/Features aus Feedback) | PLATFORM | T-067, T-068 | npm latest aktualisiert |

**Quality Gate Tag 43:**
- [ ] Nutzer-Feedback integriert
- [ ] Neues Release veroeffentlicht

---

### Tag 44 (Sonntag) — RETRO + ROADMAP

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-070 | Sprint-Retrospektive: Was hat funktioniert, was nicht? | COORDINATOR | - | RETRO-TAG28-45.md |
| T-071 | Traction-Report: Alle Metriken seit Tag 28 | STRATEGIST | T-055 | Finaler Traction-Report |
| T-072 | Roadmap Tag 46-60 entwerfen (basierend auf Traction + Feedback) | COORDINATOR | T-070, T-071 | ROADMAP-TAG46-60.md Draft |
| T-073 | ARCHITECT: Plugin-System-Design fuer Post-Processing (fuer naechsten Sprint) | ARCHITECT | T-046, T-047 | ADR committed |

**Quality Gate Tag 44:**
- [ ] Retro dokumentiert
- [ ] Roadmap-Draft existiert
- [ ] Plugin-System-ADR committed

---

### Tag 45 (Montag) — SPRINT CLOSE + NEXT SPRINT PREP

| # | Task | Owner | Abhaengigkeit | Deliverable |
|---|------|-------|---------------|-------------|
| T-074 | Alle offenen GitHub Issues labeln und priorisieren | ENGINEER | - | Issues getaggt |
| T-075 | CLAUDE.md aktualisieren (neue Learnings, Metriken, Kontakte) | COORDINATOR | T-070 | CLAUDE.md committed |
| T-076 | Memory-Files aktualisieren (project_status_r9) | COORDINATOR | T-071 | Memory updated |
| T-077 | Naechsten Sprint vorbereiten (Tag 46 ready) | COORDINATOR | T-072 | Sprint-Plan bereit |

**Quality Gate Tag 45:**
- [ ] Sprint offiziell geschlossen
- [ ] Alle Deliverables dokumentiert
- [ ] Naechster Sprint vorbereitet

---

## Kritische Abhaengigkeitskette

```
T-001 (Key Rotation) ──┐
T-002 (Headers)     ───┤
T-003 (Body Limit)  ───┼─→ Tag 28 Gate ─→ T-011 (README) ─→ T-016 (npm publish)
T-004 (npm audit)   ───┤                                          │
T-005 (.env.example)───┘                                          │
                                                                   ▼
T-006 (Dynamic Cap) ───┐                                     T-018 (browser-use)
T-007 (Nav Cap)     ───┼─→ Tag 29 Gate ─→ T-010 (Benchmark)  T-019 (Stagehand)
T-008 (Structured)  ───┘                       │                   │
                                               ▼                   ▼
                                          T-032 (Blog 2)     T-021 (Blog 1)
                                               │              T-022 (Reddit)
                                               ▼              T-023 (Danny)
                                          T-034 (Publish)     T-024 (GH Issues)
                                          T-035 (Show HN)          │
                                               │                   ▼
                                               └──→ T-038 (Feedback) ─→ T-066 (Iterate)
```

---

## Erfolgs-Metriken Tag 45

### Must-Have (Sprint ist gescheitert ohne diese)

| Metrik | Ziel | Messung |
|--------|------|---------|
| npm Downloads (14 Tage) | >= 50 | npm stats |
| GitHub Stars | >= 20 | GitHub |
| Outreach gesendet | >= 15 Kontakte | CRM-Tabelle |
| Antworten erhalten | >= 3 | CRM-Tabelle |
| Blog-Posts live | >= 3 | URLs |
| Integration-Beispiele | >= 3 | Repo |
| balage-core auf npm latest | >= 0.6.0 | npmjs.com |
| Security CRITICAL/HIGH | 0 offen | Security-Checklist |

### Nice-to-Have (Stretch Goals)

| Metrik | Ziel | Messung |
|--------|------|---------|
| Erster externer Contributor | >= 1 PR | GitHub |
| F1-Score (50-Site-Benchmark) | >= 82% | Benchmark-Result |
| Integration-Partner bestätigt | >= 1 | E-Mail/Meeting |
| Product Hunt Upvotes | >= 50 | Product Hunt |
| Danny Meeting vereinbart | Ja | Kalender |

---

## Risiken und Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|--------------------| -------|------------|
| Kein Nutzer-Interesse trotz Distribution | Mittel | CRITICAL | Feedback nach Tag 35 auswerten, Pivot-Optionen vorbereiten |
| npm Publish scheitert (Bundle, Types) | Niedrig | HIGH | Tag 30 komplett dafuer reserviert, Fallback: manual publish |
| Security-Findings tiefer als gedacht (Key in Git-History) | Mittel | HIGH | BFG-Cleaner als Backup, ggf. neues Repo |
| F1-Regression durch Quick Wins | Niedrig | MEDIUM | Benchmark-Gate in CI (T-031) verhindert Merges mit Regression |
| Danny antwortet nicht | Hoch | LOW | 5+ andere Leads parallel kontaktieren |
| HN/Reddit Posts werden ignoriert | Mittel | MEDIUM | Content-Qualitaet > Quantitaet, technische Tiefe zeigen |

---

## Entscheidungen die NICHT in diesem Sprint getroffen werden

Diese Themen wurden bewusst auf nach Tag 45 verschoben:

1. **Plugin-System fuer Post-Processing** — Nur ADR in diesem Sprint, Implementation in Tag 46+
2. **Build vs Buy (ai-sdk/linkedom)** — Evaluation erst wenn Nutzer-Feedback die Richtung zeigt
3. **Teures LLM-Modell-Wechsel** — gpt-4o-mini bleibt, 25x Kosten fuer +2-4% lohnt nicht
4. **SaaS-Pricing** — SaaS ist kein skalierbarer Pfad (Break-Even 392 Kunden). Licensing-Modell erst mit Traction
5. **Multi-Language Injection Detection** — Grundversion in T-061, vollstaendige Loesung spaeter
6. **Observability-Export zu Prometheus/Jaeger** — Strukturiertes Logging reicht fuer Beta
7. **AVV mit LLM-Providern** — Erst relevant bei zahlenden Kunden

---

## Tages-Checkliste fuer den COORDINATOR

Jeden Tag vor Arbeitsbeginn:

- [ ] Welche Tasks sind faellig?
- [ ] Gibt es Blocker?
- [ ] Sind Abhaengigkeiten erfuellt?
- [ ] Nutzer-Metriken checken (ab Tag 33)
- [ ] Outreach-Antworten checken (ab Tag 32)

Jeden Tag am Ende:

- [ ] Welche Tasks sind done?
- [ ] Quality Gate bestanden?
- [ ] Naechster Tag vorbereitet?
- [ ] ERRORS.md aktualisiert (wenn Fehler auftraten)?

---

*Sprint-Plan erstellt: 2026-03-27*
*Naechste Review: Tag 35 (Midpoint-Check)*
*Sprint-Ende: Tag 45*
