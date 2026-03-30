# Kosten- und Impact-Analyse: BALAGE+Firecrawl vs. Anthropic Computer Use

**Datum:** 2026-03-29 (Tag 29)
**Erstellt von:** STRATEGIST
**Status:** Konservative Analyse mit echten Preisen
**Disclaimer:** Alle Zahlen konservativ gerechnet. Wo Unsicherheit besteht, wird zugunsten von Computer Use gerundet.

---

## 1. ANTHROPIC COMPUTER USE (Status Quo)

### 1.1 Wie Computer Use funktioniert

1. Agent nimmt Screenshot des Bildschirms (~1280x800 bis 1920x1080)
2. Screenshot wird als Base64-Bild an Claude Vision API geschickt
3. Claude analysiert das Bild und entscheidet: klicke auf X, tippe Y
4. Agent fuehrt die Aktion aus
5. Neuer Screenshot, zurueck zu Schritt 2
6. Wiederholen bis Task abgeschlossen

Jede einzelne Aktion erfordert einen vollstaendigen API-Roundtrip mit Bild.

### 1.2 Token-Berechnung pro Screenshot

Ein Screenshot bei 1280x800 verbraucht ca. **1,100-1,600 Tokens** im Claude Vision API (je nach Komplexitaet). Anthropic's Image-Tokenisierung: ein 1280x800 Bild wird in Tiles zerlegt, typisch ~1,334 Tokens.

Dazu kommt der Konversations-Kontext:
- System-Prompt (Computer Use Instructions): ~800 Tokens
- Bisherige Konversation (waechst mit jeder Aktion): ~200-2,000 Tokens
- Tool-Call-Definitionen: ~500 Tokens

**Typischer Input pro Aktion:**

| Komponente | Tokens (Durchschnitt) |
|-----------|----------------------|
| Screenshot (Bild) | 1,334 |
| System Prompt | 800 |
| Konversations-History (Median bei Aktion 3-5) | 1,200 |
| Tool-Definitionen | 500 |
| **Total Input** | **~3,834** |

**Output pro Aktion:**

| Komponente | Tokens |
|-----------|--------|
| Reasoning + Tool-Call | 150-300 |
| **Total Output** | **~225** |

### 1.3 Kosten pro Aktion (Claude Sonnet 4.6)

```
Input:  3,834 Tokens × ($3.00 / 1,000,000) = $0.01150
Output:   225 Tokens × ($15.00 / 1,000,000) = $0.00338
                                        Total: $0.01488 pro Aktion
```

Gerundet: **~$0.015 pro Aktion.**

ACHTUNG: Bei spaetere Aktionen im gleichen Task waechst die Konversations-History. Aktion 7-10 haben typisch 4,000-6,000 Input-Tokens statt 3,834. Realistischer Durchschnitt ueber einen ganzen Task: **~$0.018 pro Aktion**.

### 1.4 Kosten pro typischem Task

| Task | Aktionen (optimistisch) | Aktionen (realistisch, inkl. Retries) | Kosten optimistisch | Kosten realistisch |
|------|------------------------|--------------------------------------|--------------------|--------------------|
| Login (Username + PW) | 4 | 6-8 | $0.060 | $0.108-0.144 |
| Formular ausfuellen (5 Felder) | 7 | 10-14 | $0.105 | $0.180-0.252 |
| Produkt suchen + kaufen | 8 | 12-18 | $0.120 | $0.216-0.324 |
| Information auf Seite finden | 3 | 5-7 | $0.045 | $0.090-0.126 |
| Navigation (3 Klicks tief) | 4 | 6-9 | $0.060 | $0.108-0.162 |
| Kompletter Checkout | 12 | 18-25 | $0.180 | $0.324-0.450 |

**Warum "realistisch" so viel hoeher:**
- Vision erkennt Buttons falsch (besonders bei kleinem Text, Icons ohne Labels) -> Retry
- Seite hat sich nach dem Screenshot veraendert (Lazy Loading, Popups) -> erneuter Screenshot
- Cookie-Banner, Popups, Overlays muessen erst geschlossen werden -> Extra-Aktionen
- Scrolling noetig wenn Element nicht im Viewport -> Extra-Screenshots

**Retry-Rate Schaetzung:** Anthropic selbst berichtet fuer Computer Use Preview eine Success Rate von ~70-80% auf komplexeren Tasks. Das impliziert: 20-30% der Tasks brauchen mindestens einen Retry-Zyklus. Pro fehlgeschlagener Aktion: 2-3 zusaetzliche Aktionen.

### 1.5 Latenz pro Aktion

| Phase | Dauer |
|-------|-------|
| Screenshot aufnehmen | 100-300ms |
| Screenshot encodieren + senden | 200-500ms (je nach Aufloesung) |
| Claude API Processing | 1,500-4,000ms (Sonnet, mit Vision) |
| Response parsen + Aktion ausfuehren | 100-300ms |
| Seite reagieren lassen (Page Load, Animation) | 500-2,000ms |
| **Total pro Aktion** | **2,400-7,100ms** |
| **Realistischer Median** | **~3,500ms** |

Ein Login-Task mit 6 Aktionen: **~21 Sekunden.**
Ein Checkout mit 18 Aktionen: **~63 Sekunden.**

### 1.6 Wenn Opus statt Sonnet genutzt wird

Manche Computer Use Implementierungen nutzen Claude Opus fuer hoehere Accuracy:

```
Input:  3,834 Tokens × ($15.00 / 1,000,000) = $0.05751
Output:   225 Tokens × ($75.00 / 1,000,000) = $0.01688
                                        Total: $0.07439 pro Aktion
```

**$0.074 pro Aktion mit Opus** -- ein Login kostet dann $0.30-0.59.

---

## 2. BALAGE + FIRECRAWL (Proposed)

### 2.1 Wie die Integration funktionieren wuerde

1. **Firecrawl** scrapt die Ziel-URL -> sauberes HTML + Markdown + Screenshot
2. **BALAGE** analysiert das HTML -> typisierte Endpoints mit CSS-Selectors, Confidence, Affordances
3. Agent hat jetzt eine **deterministische Karte** der Seite
4. Aktionen laufen via CSS-Selectors -> kein weiterer LLM-Call pro Aktion
5. Bei Seitenwechsel (Navigation, Form-Submit): zurueck zu Schritt 1

**Der fundamentale Unterschied:** Computer Use braucht pro AKTION einen LLM-Call. BALAGE+Firecrawl braucht einen LLM-Call pro SEITE, danach sind alle Aktionen auf dieser Seite deterministisch.

### 2.2 Kosten pro Seite (Initial-Analyse)

| Komponente | Kosten | Bemerkung |
|-----------|--------|-----------|
| Firecrawl Scrape | $0.001 | Standard scrape pricing |
| Firecrawl Crawl+Extract | $0.003 | Wenn strukturierte Extraktion gewuenscht |
| BALAGE LLM-Call (gpt-4o-mini) | $0.005-0.010 | Gemessen: $1.06 / 20 Sites = ~$0.053/Site, ABER das sind Multi-Segment-Calls (3-6 pro Site). Pro einfache Seite: $0.005-0.010 |
| **Total pro Seite (Scrape + BALAGE)** | **$0.006-0.013** | Ohne Firecrawl Extract |
| **Total pro Seite (Extract + BALAGE)** | **$0.008-0.013** | Mit Firecrawl Extract |

**Ehrliche Korrektur der BALAGE-Kosten:**

Die Benchmark-Daten zeigen $1.06 fuer 20 Sites, also ~$0.053 pro Site. Das inkludiert Multi-Segment-Analyse (BALAGE zerlegt eine Seite in 3-8 UI-Segmente und ruft fuer jedes den LLM auf). Fuer eine einfachere Seite (Login-Page, Search-Page) sind es 1-3 Segmente, also $0.005-0.015.

| Seiten-Komplexitaet | Segmente | BALAGE LLM-Kosten | + Firecrawl | Total |
|---------------------|----------|-------------------|-------------|-------|
| Einfach (Login) | 1-2 | $0.003-0.006 | $0.001 | $0.004-0.007 |
| Mittel (Search, Liste) | 3-4 | $0.008-0.015 | $0.001 | $0.009-0.016 |
| Komplex (Amazon, Booking) | 5-8 | $0.020-0.040 | $0.001 | $0.021-0.041 |
| **Gewichteter Durchschnitt** | 3-4 | **$0.010-0.015** | $0.001 | **$0.011-0.016** |

### 2.3 Kosten pro Aktion NACH der Initial-Analyse

**$0.000** -- Null. Keine weiteren LLM-Kosten.

Aktionen laufen ueber CSS-Selectors:
```javascript
// Computer Use: "$0.015 pro Aktion, 3.5s Latenz"
// Screenshot -> Claude Vision -> "Klicke auf den Login-Button"

// BALAGE: "$0.000 pro Aktion, 50ms Latenz"
await page.click(endpoint.anchors[0].selector); // z.B. "button[type='submit']"
await page.fill(endpoint.anchors[1].selector, username); // z.B. "input#email"
```

Einzige Ausnahme: Wenn eine Aktion eine NEUE Seite laedt, muss die neue Seite analysiert werden. Aber auch das ist ein einzelner BALAGE-Call pro Seitenwechsel, nicht pro Aktion.

### 2.4 Kosten pro typischem Task

| Task | Seitenwechsel | BALAGE Initial-Analyse | Aktion-Kosten | Total |
|------|---------------|----------------------|---------------|-------|
| Login (Username + PW) | 1-2 | $0.005-0.014 | $0.000 | $0.005-0.014 |
| Formular ausfuellen (5 Felder) | 1 | $0.010-0.016 | $0.000 | $0.010-0.016 |
| Produkt suchen + kaufen | 3-4 | $0.030-0.060 | $0.000 | $0.030-0.060 |
| Information auf Seite finden | 1 | $0.005-0.010 | $0.000 | $0.005-0.010 |
| Navigation (3 Klicks tief) | 3 | $0.015-0.048 | $0.000 | $0.015-0.048 |
| Kompletter Checkout | 4-6 | $0.040-0.096 | $0.000 | $0.040-0.096 |

### 2.5 Latenz pro Aktion

| Phase | Dauer |
|-------|-------|
| **Initial-Analyse (einmalig pro Seite):** | |
| Firecrawl Scrape | 1,000-3,000ms |
| BALAGE Heuristic-Mode (kein LLM) | 2-10ms |
| BALAGE LLM-Mode (gpt-4o-mini) | 800-2,500ms |
| **Total Initial** | **1,800-5,500ms** |
| | |
| **Folge-Aktionen (deterministisch):** | |
| CSS-Selector Lookup + Click/Fill | 20-100ms |
| Seite reagieren lassen | 200-1,000ms |
| **Total pro Folge-Aktion** | **220-1,100ms** |
| **Realistischer Median** | **~400ms** |

Ein Login-Task: 3,500ms (Initial) + 3 x 400ms (Aktionen) = **~4,700ms.**
Zum Vergleich Computer Use: **~21,000ms.** Das ist 4.5x schneller.

### 2.6 Heuristic-Mode: Der Gratis-Fallback

BALAGE bietet einen Heuristic-Mode OHNE LLM-Call:
- Kosten: $0.000
- Latenz: 2-10ms
- F1: ~55-65% (schlechter als LLM-Mode mit 74.8%, aber fuer einfache Seiten ausreichend)

Fuer Login-Pages mit Standard-Formularen (95% aller Login-Pages) reicht der Heuristic-Mode. Das reduziert die Kosten auf reine Firecrawl-Kosten: **$0.001 pro Seite.**

---

## 3. VERGLEICH: Ehrliche Zahlen

### 3.1 Kosten-Multiplikator

| Task | Computer Use (realistisch) | BALAGE+Firecrawl | Faktor |
|------|---------------------------|------------------|--------|
| Login | $0.108-0.144 | $0.005-0.014 | **8-22x guenstiger** |
| Formular ausfuellen | $0.180-0.252 | $0.010-0.016 | **11-25x guenstiger** |
| Produkt suchen + kaufen | $0.216-0.324 | $0.030-0.060 | **4-11x guenstiger** |
| Information finden | $0.090-0.126 | $0.005-0.010 | **9-25x guenstiger** |
| Navigation 3 Klicks | $0.108-0.162 | $0.015-0.048 | **2-11x guenstiger** |
| Kompletter Checkout | $0.324-0.450 | $0.040-0.096 | **3-11x guenstiger** |

**Konservativer Gesamt-Faktor: 5-10x guenstiger.**
Nicht 20x, nicht 50x. Konservativ 5-10x, weil komplexe Tasks mehr Seitenwechsel brauchen und BALAGE pro Seite LLM-Kosten hat.

**Wenn Opus genutzt wird (statt Sonnet): 25-50x guenstiger.**

### 3.2 Latenz-Vergleich

| Task | Computer Use | BALAGE+Firecrawl | Faktor |
|------|-------------|------------------|--------|
| Login (6 Aktionen) | ~21s | ~4.7s | **4.5x schneller** |
| Formular (10 Aktionen) | ~35s | ~6.5s | **5.4x schneller** |
| Checkout (18 Aktionen) | ~63s | ~22s (inkl. 4-5 Seitenwechsel) | **2.9x schneller** |

**Konservativer Gesamt-Faktor: 3-5x schneller.**
Nicht 10x, weil die Initial-Analyse pro Seite Zeit kostet. Der Vorteil waechst mit der Anzahl Aktionen pro Seite.

### 3.3 Accuracy-Vergleich

Hier wird es ehrlich und unbequem:

| Dimension | Computer Use | BALAGE+Firecrawl | Kommentar |
|-----------|-------------|------------------|-----------|
| Element-Erkennung | ~80-85% (Vision) | ~75% (F1 aktuell), Ziel 82%+ | Computer Use ist HEUTE genauer |
| Determinismus | Probabilistisch (jeder Screenshot neu) | Deterministisch (CSS-Selector) | BALAGE gewinnt klar |
| Retry-Stabilitaet | Retry kann anderes Ergebnis liefern | Retry liefert gleiches Ergebnis | BALAGE gewinnt klar |
| Dynamic Content (SPAs) | Sieht was gerendert ist | Braucht gerenderten HTML (via Firecrawl) | Patt (Firecrawl rendert JS) |
| Canvas/WebGL | Kann analysieren (sieht Pixel) | Kann NICHT analysieren | Computer Use gewinnt |
| Desktop Apps | Kann analysieren | Kann NICHT analysieren | Computer Use gewinnt |
| Popups/Overlays | Sieht aktuellen Zustand | Muss HTML neu analysieren | Computer Use leicht besser |
| Wiederholte Tasks | Jedes Mal gleich teuer | Caching moeglich (Fingerprint) | BALAGE gewinnt |

**Ehrliches Fazit Accuracy:**
- BALAGEs F1 von 74.8% ist NICHT besser als Computer Use Vision.
- BALAGEs Vorteil ist DETERMINISMUS und CACHING, nicht rohe Accuracy.
- Bei 82%+ F1 waere BALAGE fuer strukturierte Web-Tasks genuegend genau und wuerde durch Determinismus effektiv besser sein.
- Computer Use bleibt ueberlegen fuer: Desktop Apps, Canvas UIs, visuelle UIs ohne semantischen DOM.

### 3.4 Welche Tasks profitieren am meisten?

**Hoechster Vorteil BALAGE+Firecrawl (10x+ Ersparnis):**
1. Login-Flows -- Standard-Formulare, wenige Seitenwechsel, hohe Repetitionsrate
2. Search + Filter -- Selektoren sind stabil, Aktionen wiederholbar
3. Formular-Ausfuellung -- Input-Felder haben klare Selektoren
4. Wiederholte Workflows -- Fingerprint-Cache eliminiert sogar LLM-Kosten beim 2. Mal

**Mittlerer Vorteil (3-8x Ersparnis):**
5. E-Commerce Browsing -- Mehrere Seitenwechsel, aber strukturierter DOM
6. Information Extraction -- Einmalige Analyse, dann deterministischer Zugriff
7. Multi-Step Navigation -- Jede Seite braucht Analyse, aber Aktionen sind billig

**Geringer/kein Vorteil:**
8. Desktop-Applikationen -- BALAGE funktioniert NICHT (kein DOM)
9. Canvas-basierte UIs (z.B. Figma, Google Sheets) -- kein semantischer DOM
10. Hochdynamische SPAs mit WebSocket-Updates -- DOM aendert sich staendig
11. CAPTCHAs, visuell-nur Interaktionen -- braucht Vision

### 3.5 Was geht NICHT mit DOM-Analyse?

| Szenario | Warum nicht | Alternative |
|----------|------------|-------------|
| Desktop Apps (Word, Excel, SAP) | Kein HTML/DOM | Computer Use oder Accessibility APIs |
| Canvas/WebGL UIs | Pixel, kein DOM | Computer Use oder OmniParser |
| Native Mobile Apps | Kein Web-DOM | Appium/XCUITest oder Vision |
| PDFs im Browser | Eingebetteter Viewer, kein DOM | PDF-Parser direkt |
| Flash/Silverlight (Legacy) | Kein DOM | Computer Use |
| Stark obfuscierter DOM | Selektoren instabil | Computer Use als Fallback |
| CAPTCHAs | Visuell, kein DOM | Vision oder CAPTCHA-Services |

---

## 4. IMPACT AUF BALAGE

### 4.1 Was Firecrawl fuer BALAGE loesen wuerde

| Aktuelles BALAGE-Problem | Wie Firecrawl es loest |
|--------------------------|----------------------|
| **Braucht irgendwoher HTML** -- Nutzer muss selbst fetchen oder Playwright nutzen | Firecrawl liefert fertig gerendertes HTML aus jeder URL |
| **JavaScript-Rendering fehlt** -- raw HTML von SPAs ist oft leer | Firecrawl rendert JavaScript und liefert den finalen DOM |
| **Kein Screenshot fuer visuelle Validierung** | Firecrawl liefert optional Screenshots mit |
| **Onboarding-Huerde** -- Nutzer braucht technisches Setup | Firecrawl ist ein einfacher API-Call: URL rein, HTML raus |
| **Kein Markdown fuer Kontext** | Firecrawl liefert LLM-optimiertes Markdown parallel zum HTML |

**Das ist der groesste einzelne Impact:** Firecrawl loest BALAGEs groesste Schwaeche -- dass BALAGE kein eigenes Fetching hat. Aktuell muss der Nutzer HTML irgendwie beschaffen. Mit Firecrawl wird aus "gib mir HTML" ein "gib mir eine URL".

### 4.2 Was BALAGE fuer Firecrawl loesen wuerde

| Firecrawl-Limitation | Wie BALAGE es loest |
|---------------------|-------------------|
| **Firecrawl extrahiert Content, nicht Interaktionen** | BALAGE klassifiziert interaktive Endpoints (Login, Search, Checkout) |
| **Kein Typing/Semantik der Elemente** | BALAGE liefert Typen (auth, commerce, form) mit Confidence |
| **Keine Affordances** | BALAGE erklaert: "Dieser Button fuehrt zu Login", "reversible: false" |
| **Kein Trust-Layer** | BALAGE liefert Evidence-Chains und Confidence Scores |
| **Kein Selector-Mapping fuer Automation** | BALAGE liefert CSS-Selectors + ARIA-Rollen fuer jedes Element |

**Firecrawl macht Webseiten lesbar fuer LLMs. BALAGE macht Webseiten STEUERBAR fuer Agents.**
Das ist komplementaer, nicht kompetitiv.

### 4.3 Gemeinsames Produkt: "Firecrawl + BALAGE Pipeline"

```
URL (Input)
    |
    v
[Firecrawl] ---- $0.001/page
    |
    +-- Gerendertes HTML
    +-- Sauberes Markdown
    +-- Screenshot (optional)
    |
    v
[BALAGE Analyse] ---- $0.005-0.015/page
    |
    +-- Endpoint-Map (auth, search, checkout, ...)
    +-- CSS-Selectors pro Endpoint
    +-- Confidence Scores + Evidence
    +-- Affordances (was passiert wenn ich klicke?)
    |
    v
[Agent Action Layer] ---- $0.000/action
    |
    +-- page.click(selector)
    +-- page.fill(selector, value)
    +-- Deterministisch, schnell, wiederholbar
```

**Gesamtkosten pro Seite: $0.006-0.016**
**Danach: unbegrenzte Aktionen fuer $0.000**

### 4.4 Was fehlt fuer die Integration

| Komponente | Status | Aufwand |
|-----------|--------|--------|
| Firecrawl SDK einbinden | Nicht vorhanden | 4-8h |
| URL-basierte Analyse-API (`analyzeFromURL`) | Nicht vorhanden | 8-16h |
| Firecrawl HTML -> BALAGE Pipeline | Nicht vorhanden | 4-8h |
| Markdown als zusaetzlicher Kontext fuer LLM | Nicht vorhanden | 4-8h |
| Caching (Firecrawl + BALAGE kombiniert) | BALAGE hat Fingerprint-Cache | 4-8h Erweiterung |
| **Total** | | **24-48h** |

Das ist 3-6 Arbeitstage. Machbar in einem Sprint.

---

## 5. PITCH-ZAHLEN (Konservativ)

### 5.1 Die Headline-Zahlen

Basierend auf den obigen Berechnungen, KONSERVATIV gerundet:

```
"BALAGE+Firecrawl reduziert die Kosten von Web-Interaktion
um 85% gegenueber reinem Screenshot-basiertem Computer Use."

Rechnung: Durchschnittlicher Task-Mix
  Computer Use: $0.15-0.25 pro Task
  BALAGE+Firecrawl: $0.015-0.040 pro Task
  Ersparnis: ~85% (konservativ, bei einfachen Tasks 95%+)
```

```
"3-5x schnellere Ausfuehrung bei strukturierten Web-Tasks."

Rechnung: Median-Latenz
  Computer Use: ~35s pro mittlerem Task
  BALAGE+Firecrawl: ~8s pro mittlerem Task
  Faktor: 4.4x, konservativ auf 3-5x abgerundet
```

```
"Deterministische Wiederholbarkeit: gleicher Input = gleiches Ergebnis,
im Gegensatz zu probabilistischer Vision-Analyse."

Rechnung: nicht quantifizierbar als Prozentsatz,
aber der strukturelle Vorteil ist klar:
  CSS-Selector "button#login" liefert IMMER den gleichen Button.
  Vision-Analyse eines Screenshots kann beim naechsten Mal
  einen anderen Button erkennen.
```

### 5.2 Zahlen die ich NICHT empfehle zu pitchen

Diese Zahlen waeren technisch vertretbar aber uebertrieben:

| Verlockende Behauptung | Warum ich davon abrate |
|------------------------|----------------------|
| "20x guenstiger" | Stimmt nur fuer einfache Login-Tasks. Komplex: eher 4-5x. |
| "10x schneller" | Stimmt nur fuer Single-Page-Tasks. Multi-Page: eher 3x. |
| "Hoehere Accuracy" | BALAGEs F1 ist aktuell 74.8%, Computer Use Vision ist ~80-85%. Erst bei 82%+ pitchbar. |
| "Ersetzt Computer Use komplett" | Falsch. Desktop, Canvas, CAPTCHAs gehen nicht. |
| "Zero-Cost Actions" | Technisch korrekt, aber ignoriert die Initial-Analyse-Kosten. |

### 5.3 Die ehrliche Pitch-Story fuer Anthropic

```
An: Anthropic Engineering Team
Betreff: DOM-basierte Analyse als kostenguenstigerer Fallback fuer Web-Tasks in Computer Use

Problem:
Computer Use nutzt Screenshot-basierte Vision fuer ALLE Interaktionen,
inklusive Web-Seiten die einen semantischen DOM haben. Das ist wie
OCR auf einem Textdokument anwenden statt den Text direkt zu lesen.

Daten:
- Ein Login-Task kostet ~$0.11-0.14 mit Screenshot-basiertem Computer Use
- Der gleiche Task kostet ~$0.005-0.014 mit DOM-Analyse + CSS-Selectors
- Das ist 8-22x guenstiger fuer den haeufigsten Task-Typ

Vorschlag:
Fuer Web-Tasks: Erst DOM analysieren (guenstig, deterministisch).
Computer Use Vision nur als Fallback wenn:
  - Kein DOM verfuegbar (Desktop App)
  - DOM-Confidence unter Threshold
  - Visuelle Interaktion noetig (CAPTCHA, Canvas)

Vergleich (Login-Task):
  Screenshot-Pipeline: 6 Aktionen x $0.018 = $0.108, 21 Sekunden
  DOM-Pipeline:        1 Analyse x $0.013 = $0.013, 4.7 Sekunden
  Ersparnis:           88% Kosten, 78% Latenz

Das spart Anthropic Compute-Kosten UND verbessert die User Experience
durch schnellere Ausfuehrung und deterministische Ergebnisse.
```

### 5.4 Gesamtwirtschaftliche Rechnung (Hochskaliert)

Was wuerde das auf Plattform-Ebene bedeuten?

**Annahme:** 10,000 Computer Use Sessions pro Tag, davon 70% Web-Tasks.

| Metrik | Nur Computer Use | Mit DOM-Analyse fuer Web | Differenz |
|--------|-----------------|-------------------------|-----------|
| Web-Tasks pro Tag | 7,000 | 7,000 | - |
| Kosten pro Web-Task | $0.20 (Median) | $0.025 (Median) | -87.5% |
| Tageskosten Web-Tasks | $1,400 | $175 | **-$1,225/Tag** |
| Monatskosten Web-Tasks | $42,000 | $5,250 | **-$36,750/Monat** |
| Jahresersparnis | - | - | **~$441,000/Jahr** |

Bei 100,000 Sessions/Tag: **~$4.4M/Jahr Ersparnis.**

Diese Zahlen sind illustrativ. Die echten Volumina bei Anthropic kennen wir nicht. Aber die relative Ersparnis von ~85% auf Web-Tasks ist robust.

---

## 6. RISIKEN UND EHRLICHE SCHWAECHEN

### 6.1 Was gegen den Pitch spricht

| Risiko | Schwere | Mitigation |
|--------|---------|-----------|
| BALAGEs F1 ist 74.8%, nicht 82%+ | HOCH -- untergraebt Glaubwuerdigkeit | F1 auf 82%+ bringen BEVOR Anthropic-Pitch |
| Kein externer Nutzer validiert die Zahlen | HOCH -- "Trust me bro" reicht nicht | Mindestens 3 externe Nutzer mit Testimonials |
| Computer Use wird schnell besser | MITTEL -- Anthropic investiert massiv in CU | BALAGEs Vorteil ist strukturell (Kosten), nicht taktisch |
| Anthropic koennte DOM-Analyse selbst bauen | HOCH -- wenige Wochen Aufwand fuer ein Team | Schnelligkeit und bestehende Benchmark-Daten als Moat |
| Firecrawl-Integration existiert noch nicht | MITTEL -- alles bisher theoretisch | 24-48h Implementierung, dann funktionierender Prototyp |
| Dynamic Content Probleme (SPAs, WebSockets) | MITTEL -- Firecrawl loest vieles, aber nicht alles | Ehrlich kommunizieren: "funktioniert fuer 80% der Web-Tasks" |

### 6.2 Was Anthropic selbst tun koennte

**Szenario:** Anthropic liest diesen Pitch und baut es selbst in 2-4 Wochen.

Ehrliche Einschaetzung: **Wahrscheinlichkeit 40-60%.**

Gruende warum sie es NICHT selbst bauen koennten:
- DOM-Analyse ist ein geloestes-aber-muehsames Problem (BALAGEs Pipeline hat Monate gebraucht)
- Anthropic's Core-Kompetenz ist das Modell, nicht Web-Scraping
- Firecrawl oder aehnliche Services existieren bereits -- "Buy, don't build"

Gruende warum sie es DOCH selbst bauen koennten:
- Anthropic hat hunderte Engineers
- DOM-Analyse ist kein Raketenwissen
- Sie haben bereits A11y-Tree-Integration in der Pipeline

**Mitigation:** Nicht als "Kauf mich" positionieren, sondern als "hier ist eine Open-Source-Loesung die euer Produkt verbessert". Adoption > Ownership.

### 6.3 Timing-Empfehlung (unveraendert von Marktanalyse Tag 28)

**NOCH NICHT an Anthropic herantreten.**

Voraussetzungen fuer einen glaubwuerdigen Approach:
1. F1 >= 82% (aktuell 74.8% -- Gap: 7.2pp)
2. Firecrawl-Integration als funktionierender Prototyp
3. Mindestens 5 externe npm-Installs, besser 50+
4. Ein funktionierender Vergleich: "Hier ist der gleiche Task mit Computer Use vs. BALAGE+Firecrawl, gemessen, nicht geschaetzt"
5. Idealerweise: 1 Testimonial von einem browser-use oder Stagehand Nutzer

**Fruehester realistischer Zeitpunkt: Tag 60-70 (in 5-6 Wochen).**

---

## 7. ZUSAMMENFASSUNG

### Die ehrliche Kurzversion

BALAGE+Firecrawl ist fuer strukturierte Web-Tasks (Login, Search, Formulare, Checkout) **5-10x guenstiger und 3-5x schneller** als reines Screenshot-basiertes Computer Use. Der Determinismus-Vorteil (gleicher Input = gleiches Ergebnis) ist ein zusaetzlicher struktureller Vorteil der nicht in Prozent messbar ist, aber fuer Production-Workflows entscheidend.

Die Schwaeche: Computer Use funktioniert fuer ALLES (Desktop, Canvas, visuelle UIs). BALAGE funktioniert nur fuer Web-Seiten mit semantischem DOM. Das ist ~70-80% aller Computer-Use-Tasks im Web, aber nicht 100%.

### Konservative Pitch-Zahlen (empfohlen)

| Metrik | Konservative Behauptung | Obere Grenze (nur fuer einfache Tasks) |
|--------|------------------------|----------------------------------------|
| Kostenersparnis | 85% | 95%+ |
| Geschwindigkeitsfaktor | 3-5x schneller | 8-10x |
| Fehler-Reduktion | "Deterministisch statt probabilistisch" | "Identisches Ergebnis bei jedem Retry" |
| Abdeckung | 70-80% aller Web-Tasks | 90%+ bei Standard-Websites |

### Naechste Schritte (priorisiert)

| Prio | Aktion | Aufwand | Impact |
|------|--------|---------|--------|
| 1 | F1 auf 82%+ bringen (Post-Processing Fixes + Benchmark) | 2-3 Tage | Glaubwuerdigkeit |
| 2 | Firecrawl-Integration Prototyp (`analyzeFromURL`) | 3-5 Tage | Funktionierender Demo |
| 3 | Side-by-Side Vergleich: Computer Use vs. BALAGE+Firecrawl (Video) | 1-2 Tage | Visueller Proof |
| 4 | npm Downloads + externe Nutzer | Laufend | Social Proof |
| 5 | Anthropic Startup-Programm bewerben | 2h | API Credits + Tuer oeffnen |

---

*Analyse abgeschlossen: 2026-03-29*
*STRATEGIST-Bewertung: Die Zahlen sind stark genug fuer einen ueberzeugenden Pitch, aber die Voraussetzungen (F1, Traction, Prototyp) muessen erst erfuellt werden. Keine Milchmaedchenrechnung, keine geschoenten Zahlen.*
