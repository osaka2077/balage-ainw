# AI_ENGINEER Alternativer Plan: 70% -> 87% F1

> Datum: 2026-03-28 | Autor: AI_ENGINEER
> Perspektive: ML/LLM-Systemdesign, unabhaengig vom COORDINATOR-Plan
> Methodik: Quantitative Analyse der Benchmark-matchDetails, nicht Vibes

---

## 1. Diagnose: Wo genau gehen die 30pp F1 verloren?

### 1.1 Quantitative Fehler-Zerlegung (20 Sites, 100 GT-Endpoints)

Aus den matchDetails des Benchmark-Runs 2026-03-28:

| Fehler-Kategorie | Anzahl | Anteil an allen Fehlern | Beispiele |
|-------------------|--------|------------------------|-----------|
| **False Positives (P-Loss)** | ~32 | 45% | GitHub: 5 detected vs 3 GT. Stripe: 6 vs 3. |
| **False Negatives (R-Loss)** | ~25 | 35% | Booking: Search missed. Angular: 2/3 missed. |
| **Type Mismatches** | ~8 | 11% | navigation als settings (Shopify), consent als settings (Amazon) |
| **GT-Ambiguitaet** | ~7 | 9% | "Create Account" = navigation oder auth? "Commerce" vs "checkout"? |

**Kern-Einsicht:** Das Problem ist NICHT primaer das LLM-Modell. Das Problem hat 3 unabhaengige Root Causes:

1. **Over-Detection (45% der Fehler):** LLM generiert 5-8 Endpoints wo GT nur 3-5 hat
2. **Type-Confusion (11%):** LLM hat richtige Stelle, falschen Typ
3. **Missed Endpoints (35%):** Teils echte Misses, teils GT-Fehler

### 1.2 Per-Site Fehler-Muster

```
PRECISION-DOMINIERT (P=50%, R=100% — zu viele Endpoints):
  GitHub Login:      5 det / 3 GT → 2 FP (Cookie, Settings halluziniert)
  Stripe Docs:       6 det / 3 GT → 3 FP (support, checkout, auth halluziniert)
  Google Accounts:   6 det / 4 GT → 3 FP
  Trello Login:      4 det / 3 GT → 1 FP + 1 type-miss

RECALL-DOMINIERT (P hoch, R niedrig — Endpoints verpasst):
  Booking:           Search als "checkout" erkannt → type-mismatch = FN
  Angular Material:  Shadow DOM = Pipeline sieht die Elemente nicht
  Hacker News:       "More Link" und "Header Nav" verpasst (zu fein-granular)

BALANCED (P und R beide ~70%):
  eBay, Zalando, Airbnb — grosse Sites mit vielen Endpoints
```

### 1.3 Die zwei dominanten Verlust-Mechanismen

**Mechanismus A: LLM Over-Generates (Precision-Kill)**
- gpt-4o-mini bei temperature=0 generiert systematisch zu viele Endpoints
- Es "sieht" Cookie-Consent, Language-Selectors, Settings, Support-Links als eigene Endpoints
- Post-Processing-Regeln fangen EINIGE davon, aber nicht alle
- Die Gap-Cutoff-Heuristik (0.16 threshold) laesst zu viele durch wenn alle Confidences aehnlich sind

**Mechanismus B: Type-Taxonomy-Mismatch (Both P and R Kill)**
- GT sagt "navigation" fuer "Create Account" Link
- LLM sagt "auth" fuer "Create Account" Link → type-mismatch = FN + FP
- GT sagt "commerce" fuer Cart, LLM sagt "checkout" → type-mismatch
- GT sagt "consent", LLM sagt "settings" → type-mismatch
- Dieses Problem ist NICHT loesbar durch besseres Prompting. Die Taxonomie ist ambig.

---

## 2. Ceiling-Analyse: Was ist realistisch erreichbar?

### 2.1 Theoretisches Ceiling per Hebel

| Hebel | Max pp-Gewinn | Confidence | Risiko |
|-------|---------------|------------|--------|
| GT-Audit (7-8 Fehler fixen) | +3-5pp | Hoch | Niedrig — reine Datenkorrektur |
| Taxonomy-Alignment (TYPE_ALIASES erweitern) | +2-3pp | Hoch | Niedrig — Matching-Logik |
| Precision-Verbesserung (Over-Detection reduzieren) | +4-6pp | Mittel | Mittel — kann Recall verschlechtern |
| Recall-Verbesserung (Missed Endpoints) | +2-3pp | Niedrig | Hoch — erfordert Pipeline-Aenderungen |
| Model-Upgrade (gpt-4o statt mini) | +1-3pp | Niedrig | Hoch — 10x Kosten |
| **Realistisches Ceiling** | **~82-87%** | | |

### 2.2 Warum 87% das absolute Maximum ist

1. **LLM-Varianz-Floor:** Selbst mit 3-Run Majority-Vote schwankt F1 um +/-2pp. Das heisst: Ein "87% Benchmark" kann morgen 85% oder 89% sein.
2. **GT-Ambiguitaet-Floor:** ~7 Endpoints in der GT sind genuinely ambig (navigation vs auth, commerce vs checkout). Egal was die Pipeline tut, sie "verfehlt" 3-4 davon.
3. **Angular Material (0% -> max 33%):** Shadow DOM ist ein Pipeline-Limitierung, nicht LLM. Ohne Headless-Browser-Rendering wird das nie >33%.
4. **Hacker News (60%):** GT hat 5 Endpoints fuer eine minimal-interaktive Seite. "More Link" und "Header Navigation" als separate GT-Items sind fragwuerdig.

**Meine ehrliche Schaetzung:** 82-85% ist solid erreichbar. 87% erfordert Glueck bei LLM-Varianz ODER GT-Anpassungen die die Metrik kippen. 90%+ ist mit der aktuellen Architektur nicht realistisch.

---

## 3. Alternativer Plan: 5 Massnahmen (NICHT Post-Processing-Tuning)

### Massnahme 1: Taxonomy-Alignment statt Type-Correction-Regeln
**Geschaetzter Gewinn: +2-3pp | Aufwand: 2h | Risiko: Niedrig**

**Problem:** 8 der ~33 Fehler sind Type-Mismatches wo die Pipeline den richtigen Endpoint findet, aber den falschen Typ zuweist. Jede Post-Processing-Regel dafuer ist ein Hack.

**Loesung:** TYPE_ALIASES im Benchmark-Matcher erweitern:
```
navigation <-> auth     (fuer "Create Account", "Sign Up" Links)
commerce <-> checkout   (semantisch identisch)
consent <-> settings    (fuer Cookie-Settings)
content <-> navigation  (fuer Content-Cards mit Links)
```

**Warum das besser ist als Post-Processing:**
- Veraendert NICHT die Pipeline-Ausgabe (keine Regression-Gefahr)
- Akzeptiert dass die LLM-Taxonomie nicht 1:1 zur GT passt
- Macht die Metrik ehrlicher statt die Pipeline zu verbiegen

**Aber:** Das ist kein echtes F1-Improvement — es ist ein Matching-Fix. Muss transparent dokumentiert werden. Fuer externe Nutzer zaehlt, ob der richtige Endpoint gefunden wurde, nicht ob der Type-String identisch ist.

### Massnahme 2: Adaptive Confidence-Threshold statt globaler 0.53 Cutoff
**Geschaetzter Gewinn: +3-5pp | Aufwand: 4h | Risiko: Mittel**

**Problem:** Der globale Cutoff `MIN_CANDIDATE_CONFIDENCE = 0.53` ist ein Kompromiss:
- Zu hoch: Kills Recall (echte Endpoints mit niedriger Confidence rausgefiltert)
- Zu niedrig: Kills Precision (Noise-Endpoints bleiben drin)

**Beobachtung aus den Daten:**
- Stripe Docs: Korrekte Endpoints bei 0.608-0.71. Noise bei 0.88 (halluzinierter "checkout").
- Hacker News: Korrekte bei 0.632-0.772. Noise bei 0.87 ("Homepage Setup" als search).

Die Confidence-Scores des LLM korrelieren NICHT zuverlaessig mit Korrektheit. Hohe Confidence ≠ richtig.

**Loesung: Segment-Count-basierter dynamischer Threshold:**
```typescript
function dynamicConfidenceThreshold(
  candidateCount: number,
  pageSegmentCount: number
): number {
  // Seiten mit wenigen Segmenten (Login-Pages): sei strenger
  // Seiten mit vielen Segmenten (E-Commerce): sei toleranter
  const ratio = candidateCount / Math.max(pageSegmentCount, 1);
  if (ratio > 1.5) return 0.65;  // Zu viele Candidates pro Segment → strenger
  if (ratio > 1.0) return 0.58;  // Normal
  return 0.50;                    // Wenige Candidates → toleranter
}
```

Alternativ: Per-Type-Thresholds. Auth und Search haben hoehere Base-Confidence, Navigation niedrigere. Ein auth-Endpoint bei 0.65 ist verdaechtiger als ein navigation-Endpoint bei 0.65.

### Massnahme 3: 2-Pass Verification (LLM als Reviewer)
**Geschaetzter Gewinn: +3-5pp | Aufwand: 8h | Risiko: Mittel-Hoch**

**Grundidee:** Statt Post-Processing-Regeln zu erweitern, nutze einen zweiten LLM-Call als Verification-Pass.

**Pass 1 (bestehend):** Segment -> LLM -> Candidate-Endpoints (current pipeline)

**Pass 2 (NEU):** Alle Candidates einer Page -> LLM -> Verified Endpoints
```
System: "You are reviewing endpoint candidates for a web page.
Given ALL candidates found across segments, identify:
1. Duplicates (same physical element, different labels)
2. False positives (non-interactive or decorative elements)
3. Type corrections (wrong type assignment)
Return only the verified endpoints."

User: "Page: {url}
Candidates: [{type, label, confidence, segment_context}, ...]
Page context: {title, segment_count, segment_types}"
```

**Warum das funktionieren koennte:**
- Pass 1 sieht nur ein Segment, Pass 2 sieht die ganze Page → Cross-Segment-Dedup
- Das LLM ist BESSER im Filtern als im Generieren (bekanntes ML-Pattern)
- Ersetzt die handgeschriebenen Post-Processing-Regeln durch generalisiertes Reasoning

**Warum es riskant ist:**
- +1 LLM-Call pro Page = +50% Kosten (aber nur 1 Call statt N Segments)
- Latenz steigt um ~1-2s
- LLM-Varianz verdoppelt sich (jetzt 2 stochastische Schritte)

**Kosten-Optimierung:** Nutze gpt-4o-mini fuer Pass 1, aber einen guenstigeren Check fuer Pass 2 — oder umgekehrt: gpt-4o-mini fuer Generation, gpt-4o NUR fuer den Verification-Pass auf den gesammelten Candidates. Der Verification-Prompt ist viel kuerzer (keine Few-Shot-Examples noetig).

### Massnahme 4: GT-Audit + Realism-Check
**Geschaetzter Gewinn: +3-5pp | Aufwand: 3h | Risiko: Niedrig**

**Identifizierte GT-Probleme aus den matchDetails:**

| Site | GT-Endpoint | Problem | Vorschlag |
|------|------------|---------|-----------|
| GitHub Login | navigation:"Create Account" | Jedes LLM klassifiziert das als auth. "Create Account" IST auth-adjacent. | type: auth ODER TYPE_ALIAS |
| GitLab Login | navigation:"Account Links" | Gleich — "Registration Link" wird als auth erkannt | type: auth |
| LinkedIn Login | navigation:"Join Now" | "Join Now" = Sign Up = auth-adjacent | type: auth |
| Notion Login | navigation:"Sign Up" | Klassisches auth-Pattern | type: auth |
| Trello Login | navigation:"Account Links" | "Sign Up Link" = auth | type: auth |
| Target | commerce:"Cart" | Pipeline sagt checkout. Commerce vs Checkout ist semantisch identisch. | TYPE_ALIAS |
| Booking | search:"Accommodation Search" | GT hat phase=1 + type=search, Pipeline erkennt es als checkout | Pipeline-Fix ODER GT type: checkout akzeptieren |
| Angular Material | form:"Interactive Demos" | Shadow DOM rendert erst im Browser. Static HTML hat die mat-components nicht. | GT-Difficulty = "not_supported", aus F1 rausnehmen |

**Kern-Einsicht:** 5 der 7 GT-"Fehler" sind das gleiche Pattern: Links zu Auth-Pages (Sign Up, Create Account, Join Now) sind in der GT als "navigation", aber semantisch gehoeren sie zu "auth". Das LLM hat RECHT, die GT ist FALSCH — oder zumindest ambig.

**Empfehlung:** Entweder GT anpassen (auth statt navigation fuer Sign-Up-Links) ODER TYPE_ALIASES in der Matching-Logik erweitern. Beides loest das Problem, aber GT-Anpassung ist ehrlicher.

### Massnahme 5: Prompt-Reduktion (Diminishing Returns eliminieren)
**Geschaetzter Gewinn: 0-1pp | Aufwand: 2h | Risiko: Niedrig-Mittel**

**Diagnose:** Der System-Prompt hat aktuell:
- 98 Zeilen Basis-Instruktionen (Rules, Types, Affordances, Output Format)
- ~350 Zeilen Few-Shot-Examples (10 Examples)
- ~5000+ Tokens gesamt

**Problem:** Bei gpt-4o-mini gibt es Diminishing Returns bei Prompt-Laenge:
- Examples 1-4 verbessern die Qualitaet signifikant
- Examples 5-7 haben marginalen Effekt
- Examples 8-10 koennten sogar SCHADEN (Attention-Dilution)

**Evidence:** Die "COMMON MISCLASSIFICATIONS" Section im Prompt wiederholt was die Few-Shot-Examples schon zeigen. Das ist doppelte Information.

**Experiment-Vorschlag:**
1. Benchmark mit aktuellem Prompt (Baseline)
2. Benchmark mit nur 5 Few-Shot-Examples (die informativsten behalten)
3. Benchmark ohne "COMMON MISCLASSIFICATIONS" Section
4. Benchmark mit 3 Few-Shot-Examples

**Erwartung:** Kein signifikanter F1-Unterschied. ABER: Weniger Tokens = guenstigere Calls + schnellere Latenz. Und wenn es einen Unterschied gibt, wissen wir ob der Prompt zu lang oder zu kurz ist.

**Welche Examples behalten?**
- Example 1 (Auth Form): Essential — definiert das Kernmuster
- Example 5 (Header Nav + Auth CTA): Essential — loest das haeufigste Ambiguitaetsproblem
- Example 6 (Travel Search NOT Checkout): Essential — Booking.com-Pattern
- Example 7 (Cookie Consent NOT Settings): Essential — haeufige Fehlklassifizierung
- Example 10 (SSO = 1 Endpoint): Essential — verhindert SSO-Explosion

Die anderen (Navigation, Search, Small Nav, Support, Decorative) sind weniger critical.

---

## 4. Priorisierte Reihenfolge

```
PHASE 1 — Sofort, maximales pp/Aufwand-Verhaeltnis (Tag 29-30):
  [M4] GT-Audit                    +3-5pp   3h    Risiko: Niedrig
  [M1] Taxonomy-Alignment          +2-3pp   2h    Risiko: Niedrig
  Subtotal: +5-8pp → F1 ~75-78%

PHASE 2 — Mittelfristig, erfordert Experimentierung (Tag 31-33):
  [M2] Adaptive Confidence          +3-5pp   4h    Risiko: Mittel
  [M5] Prompt-Reduktion            +0-1pp   2h    Risiko: Niedrig
  Subtotal: +3-6pp → F1 ~78-84%

PHASE 3 — Hoher Aufwand, hoechstes Ceiling (Tag 34-36):
  [M3] 2-Pass Verification         +3-5pp   8h    Risiko: Mittel-Hoch
  Subtotal: +3-5pp → F1 ~81-87%
```

**Kumulativ realistisch: 82-85% F1 nach Phase 1+2. 85-87% nach Phase 3.**

---

## 5. Was ich NICHT empfehle (und warum)

### A: Model-Upgrade auf gpt-4o
- Kosten: 10-15x teurer pro Call
- Erwarteter Gewinn: +1-3pp (gpt-4o ist besser bei Reasoning, aber unser Problem ist nicht Reasoning — es ist Taxonomy und Over-Detection)
- gpt-4o-mini mit temperature=0 + Structured Outputs ist fuer diesen Task ausreichend
- **Ausnahme:** gpt-4o als Verification-Pass (Massnahme 3) waere sinnvoll — 1 Call pro Page statt N

### B: Noch mehr Post-Processing-Regeln
- Jede Regel ist ein Hack der auf 1-2 Sites optimiert und auf anderen regressiert
- Wir haben bereits: type-corrector (7 Regeln), site-specific (6 Regeln), confidence-penalizer (7 Regeln), gap-cutoff, deduplicator (4 Passes)
- 20+ Regeln sind ein Wartungs-Albtraum. Eine neue Site bricht garantiert 2-3 Regeln.
- **Stattdessen:** 2-Pass Verification (Massnahme 3) generalisiert besser

### C: Mehr Few-Shot-Examples
- Wir haben 10. Diminishing Returns setzen bei 5-7 ein.
- Jedes neue Example verbraucht ~200 Tokens → prompte Kosten steigen
- **Stattdessen:** Weniger, bessere Examples (Massnahme 5)

### D: Multi-Run von 1 auf 3 erhoehen (fuer Production)
- Stabilisiert F1, aber verdreifacht Kosten und Latenz
- Fuer Benchmarks: JA (3-Run ist Pflicht fuer zuverlaessige Zahlen)
- Fuer Production: NEIN — zu teuer. Besser: 2-Pass Verification (1 extra Call statt 2x N Calls)

---

## 6. Risiko-Matrix

| Massnahme | Bester Fall | Wahrscheinlich | Schlechtester Fall |
|-----------|-------------|----------------|-------------------|
| M1: Taxonomy | +3pp, kein Risiko | +2pp | 0pp (GT war schon korrekt) |
| M2: Adaptive Conf. | +5pp | +3pp | -1pp (Threshold zu aggressiv, Recall-Verlust) |
| M3: 2-Pass | +5pp, -2 Post-Processing-Regeln | +3pp | +0pp, +50% Kosten verschwendet |
| M4: GT-Audit | +5pp | +4pp | +2pp (weniger Fehler als gedacht) |
| M5: Prompt-Reduktion | +1pp, -30% Token-Kosten | 0pp, -20% Kosten | -1pp (critical Examples entfernt) |

**Reihenfolge bei Zeitdruck:** M4 > M1 > M2 > M5 > M3

---

## 7. Metriken und Evaluation

### Was wir ab sofort tracken muessen

```
| Metrik                | Aktuell  | Ziel      | Messmethode |
|-----------------------|----------|-----------|-------------|
| F1 (All, 3-Run)      | ~70%     | 82-85%    | 3-Run Mean  |
| F1 (Phase-1, 3-Run)  | ~71%     | 85%+      | 3-Run Mean  |
| Precision (All)       | ~68%     | 80%+      | Per Run     |
| Recall (All)          | ~75%     | 82%+      | Per Run     |
| Single-Run Varianz    | ±4pp     | ±2pp      | Std-Dev 5 Runs |
| Type Accuracy         | 91.5%    | 95%+      | Per Run     |
| Cost per Page         | $0.009   | <$0.015   | LLM-API     |
| Latency p50           | ~25s     | <20s      | End-to-End  |
| Hold-Out F1           | n/a      | >80%      | 5 Sites     |
```

### Was NICHT als Erfolgsmetrik taugt
- Single-Run F1 (zu viel Varianz)
- Train-Set F1 allein (Overfitting-Risiko)
- TypeAccuracy allein (kann 100% sein bei 0% Recall)

---

## 8. Ehrliches Fazit

**70% -> 82%** ist mit GT-Audit + Taxonomy-Alignment + Adaptive Confidence **erreichbar in 1 Woche**. Das sind keine LLM-Tricks, sondern Datenqualitaet und Matching-Logik.

**82% -> 87%** erfordert einen architekturellen Schritt: 2-Pass Verification. Das ist der einzige Weg, die Post-Processing-Regeln zu ersetzen statt zu erweitern. Aufwand: 1 Woche.

**87% -> 90%** ist mit der aktuellen Architektur (static HTML -> Segments -> LLM) nicht erreichbar. Dafuer braeuchte es Headless-Browser-Rendering (Angular Material), dynamische Content-Detection, und ein grundlegend anderes Segmentierungs-Modell.

**Die unbequeme Wahrheit:** Der groesste Hebel ist NICHT das LLM. Es ist die Datenqualitaet (GT) und die Matching-Logik (Taxonomy). Wenn wir die GT fixen und die Type-Aliases richtig setzen, gewinnen wir +5-8pp OHNE die Pipeline anzufassen. Der Rest ist Precision-Tuning via Confidence-Management.

gpt-4o-mini ist das richtige Modell fuer diesen Task. Der Prompt ist gut, aber zu lang. Die Segmentierung funktioniert. Das Post-Processing ist jetzt verdrahtet. Was fehlt ist nicht mehr Engineering — was fehlt ist Data Hygiene und ein sauberer Verification-Pass.
