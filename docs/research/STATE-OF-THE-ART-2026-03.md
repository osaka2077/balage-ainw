# State-of-the-Art: Web Element Detection, UI Understanding & Browser Agent Tooling

**Datum:** 2026-03-26
**Kontext:** BALAGE F1=73% auf 20 Benchmark-Sites, Pipeline: HTML -> DOM-Parse -> Segment -> Heuristic + LLM -> Endpoints

---

## 1. Akademische Papers & Modelle (2024-2026)

### 1.1 GUI Visual Grounding

#### ShowUI (CVPR 2025, Outstanding Paper @ NeurIPS 2024 Workshop)
- **Was:** 2B Vision-Language-Action Modell fuer GUI-Grounding
- **Technik:** UI-Guided Visual Token Selection formuliert Screenshots als UI-Connected-Graph, reduziert 33% redundante Visual Tokens
- **Performance:** 75.1% Zero-Shot Screenshot Grounding Accuracy (besser als UGround-7B mit 73.3%, CogAgent-18B mit 47.4%)
- **BALAGE-Relevanz:** ShowUI arbeitet rein visuell auf Screenshots. BALAGE arbeitet auf raw HTML ohne Browser -- kein direkter Einsatz moeglich, aber die Token-Selection-Idee (irrelevante Bereiche frueher entfernen) ist uebertragbar auf DOM-Pruning
- **Geschaetzter F1-Impact:** +2-4% (Token-Selection-Konzept auf DOM)
- **Aufwand:** Mittel (Pruner-Optimierung)
- **Quelle:** https://github.com/showlab/ShowUI

#### UGround (ICLR 2025 Oral)
- **Was:** Universal Visual Grounding Modell, trainiert auf 10M Elementen aus 1.3M Screenshots
- **Technik:** LLaVA-Architektur mit web-basiertem synthetischem Training, Pixel-Koordinaten-basiertes Grounding
- **Modelle:** Qwen2-VL-basiert (2B, 7B, 72B Parameter)
- **Performance:** +20% absolute Verbesserung ueber vorherige Visual Grounding Modelle
- **BALAGE-Relevanz:** Rein visuell (braucht Screenshots), aber das synthetische Datengenerierungs-Verfahren (Screenshots + Element-Labels automatisch generieren) koennte fuer BALAGE-Training-Daten angewandt werden
- **Geschaetzter F1-Impact:** Indirekt: +3-5% durch bessere Training-Daten
- **Aufwand:** Hoch (eigene Datenpipeline aufbauen)
- **Quelle:** https://github.com/OSU-NLP-Group/UGround

#### SeeClick (2024)
- **Was:** Visual GUI Agent basierend nur auf Screenshots, erstellt ScreenSpot-Benchmark
- **Technik:** GUI Grounding ohne DOM/HTML, nur Pixel
- **BALAGE-Relevanz:** Zeigt, dass rein visuelle Ansaetze stark sind -- aber BALAGE's Staerke ist gerade der browserless HTML-Ansatz. Kein direkter Nutzen.
- **Quelle:** https://www.semanticscholar.org/paper/SeeClick:-Harnessing-GUI-Grounding-for-Advanced-GUI-Cheng-Sun/f9b39a6a7e40986b46f7796f3a805d70d7e3931a

#### CogAgent (CVPR 2024)
- **Was:** 18B Visual Language Model fuer GUI Agents
- **Technik:** VLM pre-trained auf Web/GUI-Daten
- **BALAGE-Relevanz:** Zu gross und visuell fuer BALAGE's Use-Case
- **Quelle:** https://www.researchgate.net/publication/384235870_CogAgent_A_Visual_Language_Model_for_GUI_Agents

#### Aria-UI (2024/12)
- **Was:** Pure-Vision Ansatz ohne auxiliaere Inputs, skalierbare Datenpipeline
- **Technik:** Interleaved Action Histories fuer kontextbewusstes Grounding
- **BALAGE-Relevanz:** Datenpipeline-Konzept uebertragbar
- **Quelle:** OSU-NLP-Group GUI-Agents-Paper-List

### 1.2 HTML/DOM-Verstaendnis Modelle

#### DOM-LM (2022, OSU-NLP)
- **Was:** Transformer-basierter Encoder fuer HTML-Dokumente mit DOM-Tree-Structure
- **Technik:** Extra Position Embeddings fuer DOM-Baum-Struktur, MLM Pre-Training mit Masked Token UND Masked Node Objectives
- **Performance:** Konsistent besser als alle Baselines bei Attribute Extraction, Open IE, QA
- **BALAGE-Relevanz:** HOCH -- DOM-LM ist genau der richtige Ansatz fuer BALAGE's Szenario (HTML-Input, Klassifikation). Koennte als Feature-Extraktor vor dem LLM oder als Ersatz fuer den LLM dienen
- **Geschaetzter F1-Impact:** +5-10% (als Pre-Classifier oder Feature-Extraktor)
- **Aufwand:** Hoch (Pre-Training oder Fine-Tuning notwendig)
- **Quelle:** https://arxiv.org/abs/2201.10608

#### MarkupLM (ACL 2022)
- **Was:** Pre-Training auf Text + Markup Language fuer Document Understanding
- **Technik:** XPath Embeddings um DOM-Position zu kodieren
- **BALAGE-Relevanz:** Mittel -- XPath-Embeddings koennten als zusaetzliches Feature in BALAGE's Heuristik einfliessen
- **Geschaetzter F1-Impact:** +3-5%
- **Aufwand:** Mittel-Hoch
- **Quelle:** https://aclanthology.org/2022.acl-long.420.pdf

#### WebFormer (WWW 2022, Google)
- **Was:** Web-page Transformer fuer Structure Information Extraction
- **Technik:** HTML-Tokens mit Graph Attention zwischen DOM-Nodes, Rich Attention Patterns zwischen HTML und Text Tokens
- **BALAGE-Relevanz:** Mittel -- WebFormer's Graph Attention auf DOM koennte BALAGE's Segment-Klassifikation verbessern, aber braucht Training auf gelabelten Daten
- **Geschaetzter F1-Impact:** +4-7%
- **Aufwand:** Hoch
- **Quelle:** https://arxiv.org/abs/2202.00217

#### Hierarchical Multimodal Pre-training for Webpages (2024)
- **Was:** Hierarchisches Pre-Training das visuelle und textuelle Web-Informationen verbindet
- **BALAGE-Relevanz:** Gering (braucht Rendering)
- **Quelle:** https://arxiv.org/html/2402.18262v1

### 1.3 Web Page Segmentation

#### WebSAM-Adapter (2024)
- **Was:** Adaption von Meta's Segment Anything Model (SAM) fuer Web Page Segmentation
- **Technik:** Drei-Modul-Architektur mit minimalen trainierbaren Parametern
- **BALAGE-Relevanz:** Gering -- visuell basiert, braucht gerenderte Screenshots
- **Quelle:** https://link.springer.com/chapter/10.1007/978-3-031-56027-9_27

#### Beyond DOM: Source Code Neural Networks (2024/2025)
- **Was:** Web Page Layout Modellierung direkt aus HTML+CSS Source Code
- **Technik:** Spezialisierte Encoder fuer Style Rules, CSS Selectors, HTML Attributes -- kein Rendering noetig
- **BALAGE-Relevanz:** HOCH -- arbeitet wie BALAGE ohne Browser auf Source Code. CSS-Encoder-Konzept koennte BALAGE's Segmentierung verbessern
- **Geschaetzter F1-Impact:** +3-5%
- **Aufwand:** Mittel
- **Quelle:** https://www.mdpi.com/2673-2688/6/9/228

### 1.4 GNNs auf DOM Trees

#### Klarna Product Page Dataset (2021/2024 aktualisiert)
- **Was:** 51,701 gelabelte E-Commerce-Produktseiten von 8,175 Websites, GNN-Benchmark
- **Technik:** GCN (Graph Convolutional Network) auf DOM-Baum, dann LLM fuer finale Nomination. Einfacher GCN schlaegt komplexe Methoden.
- **Ergebnis:** GCN + LLM verbessert Accuracy um 16.8 Prozentpunkte gegenueber LLM-only
- **BALAGE-Relevanz:** SEHR HOCH -- exakt BALAGE's Szenario. GNN als Pre-Filter vor LLM ist die vielversprechendste Technik
- **Geschaetzter F1-Impact:** +8-15% (GNN Pre-Filter + LLM)
- **Aufwand:** Hoch (GNN-Training, aber Klarna-Dataset als Startpunkt)
- **Quelle:** https://arxiv.org/abs/2111.02168 / https://github.com/klarna/product-page-dataset

#### DOM-Q-NET (ICLR 2019)
- **Was:** GNN-basierte Q-Funktion fuer Web Navigation auf DOM Trees
- **Technik:** Graph Neural Network repraesentiert HTML-Baumstruktur, separate Netzwerke fuer Click vs. Type Actions
- **BALAGE-Relevanz:** Mittel -- GNN-auf-DOM-Idee relevant, aber RL-Kontext nicht direkt uebertragbar
- **Quelle:** https://arxiv.org/abs/1902.07257

### 1.5 Cookie Consent / Form Detection

#### BERT-basierte Cookie-Consent-Klassifikation (USENIX Security 2024)
- **Was:** BERT-Modell trainiert auf 2,353 gelabelten interaktiven Elementen in Cookie-Bannern
- **Technik:** NLP auf Element-Labels, Klassifikation: accept, reject, close, save, settings (95.1% Accuracy)
- **BALAGE-Relevanz:** HOCH -- direkt anwendbar auf BALAGE's consent-Erkennung
- **Geschaetzter F1-Impact:** +3-5% auf consent-Typ
- **Aufwand:** Niedrig-Mittel (BERT Fine-Tuning auf eigenem Dataset)
- **Quelle:** https://www.usenix.org/system/files/usenixsecurity24-bouhoula.pdf

#### Phishing Detection mit DOM-Graph + URL Features (2024)
- **Was:** Graph Convolutional Networks auf HTML DOM Graphs kombiniert mit Transformer Networks
- **Technik:** Multi-modale Integration: DOM-Struktur als Graph + URL-Features + Content-Features
- **Performance:** F1 > 99% fuer Login-Page-Detection
- **BALAGE-Relevanz:** HOCH -- die Feature-Kombination (DOM-Graph + Text-Features + URL) ist direkt auf BALAGE uebertragbar
- **Geschaetzter F1-Impact:** +5-8% speziell fuer auth-Erkennung
- **Aufwand:** Mittel
- **Quelle:** https://www.mdpi.com/2079-9292/13/16/3344

### 1.6 Self-Training & Active Learning (EMNLP 2024)

#### HAST: Self-Training for Sample-Efficient Active Learning
- **Was:** Self-Training mit Pseudo-Labels fuer Text-Klassifikation
- **Technik:** Pre-Trained LM generiert Pseudo-Labels, iteratives Re-Training mit nur 25% der Daten
- **BALAGE-Relevanz:** HOCH -- BALAGE hat 20 Benchmark-Sites mit Labels. Self-Training koennte den Benchmark auf 100+ Sites erweitern ohne manuelles Labeling
- **Geschaetzter F1-Impact:** +5-10% (indirekt durch mehr Training-Daten)
- **Aufwand:** Mittel
- **Quelle:** https://aclanthology.org/2024.emnlp-main.669/

---

## 2. Open-Source Tools & Frameworks

### 2.1 Browser Agent Element Detection

#### browser-use (Python, 36k+ GitHub Stars)
- **Architektur:** 4-Stage CDP Pipeline
  1. Data Fusion: 5 parallele CDP-Calls (DOM, Accessibility Tree, Snapshot, Viewport, Event Listeners)
  2. Tree Simplification: Entfernt non-interactive Content
  3. Paint Order & Visibility Filtering: Z-Index, Viewport Bounds
  4. Interactive Element Detection & Indexing: Numerische IDs fuer LLM
- **Element-Erkennung:** HTML Semantics + ARIA Roles + CSS Cursor Styles + JavaScript Event Listeners
- **Performance:** 10,000 DOM-Nodes -> ~200 interactive Elements, 10-100ms, 95%+ Cache Hit Rate
- **Shadow DOM:** Accessibility Tree flacht Shadow DOM automatisch ab
- **WebVoyager Score:** 89.1%
- **BALAGE-Relevanz:** browser-use braucht einen Browser (CDP). ABER: Die Pruning-Strategie (10k -> 200 Nodes) und das Indexing-System sind konzeptuell uebertragbar
- **Geschaetzter F1-Impact:** +3-5% (Pruning-Strategie adaptieren)
- **Aufwand:** Niedrig (Pruner-Verbesserungen)
- **Quelle:** https://github.com/browser-use/browser-use / https://deepwiki.com/browser-use/browser-use/2.4-dom-processing-engine

#### Stagehand (TypeScript, Browserbase)
- **Architektur:** CDP-native (kein Playwright seit v3)
- **Element-Erkennung:**
  1. Chrome Accessibility Tree statt raw DOM (80-90% weniger Daten)
  2. Candidate Elements = Leaf Elements (user-facing content) OR Interactive Elements
  3. DOM Chunking fuer Token-Budget-Einhaltung
  4. Depth-First-Search ueber alle Frames inkl. OOPIF (Out-of-Process iframes)
- **BALAGE-Relevanz:** HOCH -- Accessibility Tree als Alternative/Ergaenzung zu raw HTML ist die interessanteste Idee fuer BALAGE
- **Geschaetzter F1-Impact:** +4-7% (Accessibility Tree Parsing hinzufuegen)
- **Aufwand:** Mittel (braucht Browser fuer A11y Tree, aber koennte als optionaler Mode implementiert werden)
- **Quelle:** https://github.com/browserbase/stagehand

#### Skyvern (Python, Y Combinator)
- **Architektur:** Multi-Agent (Interactable Element Agent + Navigation Agent + Data Extraction Agent)
- **Element-Erkennung:** Computer Vision + LLM statt DOM-Parsing. Analysiert Farben, Formen, Text-Positionen, Kontext
- **BALAGE-Relevanz:** Gering (braucht Rendering + Screenshots). Aber das Multi-Agent-Konzept (spezialisierte Agents pro Aufgabe) koennte BALAGE's Pipeline verbessern
- **Quelle:** https://github.com/Skyvern-AI/skyvern / https://www.skyvern.com/blog/how-skyvern-reads-and-understands-the-web/

#### LaVague (Python, Open Source)
- **Architektur:** World Model (Objective -> Instructions) + Action Engine (Instructions -> Selenium/Playwright Code)
- **Element-Erkennung:** LLM-basiert, "Click the green button" -> findet und klickt es
- **BALAGE-Relevanz:** Gering (braucht Browser)
- **Quelle:** https://github.com/lavague-ai/LaVague

#### Aime Browser-Use (92.34% WebVoyager)
- **Architektur:** Semantic DOM Parsing via JavaScript Injection
- **Element-Erkennung:** JavaScript transformiert Webpages in "Annotated Semantic Graphs" -- DOM-Nodes werden mit funktionaler Bedeutung annotiert
- **Multimodal:** Kombiniert DOM-Textanalyse mit VLM-basierter visueller Verarbeitung
- **BALAGE-Relevanz:** Mittel -- "Annotated Semantic Graph" Konzept koennte auf BALAGE's DOM-Baum angewandt werden (Nodes mit semantischen Labels anreichern bevor LLM sie sieht)
- **Geschaetzter F1-Impact:** +2-4%
- **Aufwand:** Mittel
- **Quelle:** https://aime-browser-use.github.io/

#### Index (lmnr-ai, 92% WebVoyager mit Claude 3.7)
- **Architektur:** Vision LLMs mit Reasoning, powered by AI SDK
- **BALAGE-Relevanz:** Gering (vision-basiert, braucht Browser)
- **Quelle:** https://github.com/lmnr-ai/index

### 2.2 HTML/Web Content Processing

#### Jina ReaderLM-v2 (1.5B Parameter, 2025)
- **Was:** SLM spezialisiert auf HTML-to-Markdown UND HTML-to-JSON Konvertierung
- **Performance:** ROUGE-L 0.84, JSON F1 0.81, 512K Token Context, 29 Sprachen
- **Uebertrifft:** GPT-4o um 15-20% auf HTML-Benchmarks bei winziger Modellgroesse
- **BALAGE-Relevanz:** SEHR HOCH -- Koennte als Pre-Processing-Schritt BALAGE's DOM-Pruner ersetzen oder ergaenzen. HTML->Markdown reduziert Token-Count massiv und erhaelt semantische Struktur
- **Geschaetzter F1-Impact:** +5-8% (saubererer Input fuer LLM)
- **Aufwand:** Niedrig (API-Call oder lokales 1.5B Modell)
- **Quelle:** https://huggingface.co/jinaai/ReaderLM-v2 / https://jina.ai/news/readerlm-v2-frontier-small-language-model-for-html-to-markdown-and-json/

#### Firecrawl
- **Was:** Web Data API fuer AI, konvertiert Websites in LLM-ready Markdown oder strukturiertes JSON
- **Technik:** JavaScript Rendering + Content Extraction + Markdown/JSON Konvertierung
- **BALAGE-Relevanz:** Mittel -- Firecrawl's Schema-basierte Extraktion koennte als Validierungsschicht dienen
- **Quelle:** https://github.com/firecrawl/firecrawl

#### OmniParser V2 (Microsoft, 2025)
- **Was:** Screen Parsing Tool fuer pure-vision GUI Agents
- **Technik:** Detection Model (interactable Icons finden) + Captioning Model (funktionale Semantik extrahieren)
- **Performance:** SOTA auf ScreenSpot Pro (39.6%), Windows Agent Arena
- **V2:** 60% weniger Latenz, feineres Icon-Detection
- **BALAGE-Relevanz:** Gering (visuell/Screenshot-basiert)
- **Quelle:** https://github.com/microsoft/OmniParser

#### Pix2Struct (Google, ICML 2023)
- **Was:** Pre-Trained Image-to-Text Modell, gelernt durch Parsen von maskierten Web-Screenshots zu vereinfachtem HTML
- **Technik:** Variable-Resolution Input, Language Prompts gerendert direkt aufs Bild
- **BALAGE-Relevanz:** Gering (visuell), aber das Pre-Training-Konzept (Screenshots -> HTML) koennte umgekehrt werden (HTML -> strukturierte Beschreibung)
- **Quelle:** https://arxiv.org/abs/2210.03347

### 2.3 Benchmarks

#### Mind2Web (NeurIPS 2023 Spotlight)
- **Was:** 2,000+ Tasks auf 137 Websites, 31 Domains
- **Technik:** Crowdsourced Action Sequences, diverse Domains
- **Erkenntnis:** DOM-Elemente bekommen "bid" (Browser Element Identifiers) + Bounding Boxes
- **BALAGE-Relevanz:** Mittel -- Dataset koennte als Trainings-/Validierungsdaten fuer BALAGE genutzt werden
- **Quelle:** https://github.com/OSU-NLP-Group/Mind2Web

#### WebArena (ICLR 2024)
- **Was:** Kontrollierte Web-Umgebung mit 4 Domains (E-Commerce, Forums, PM, Content)
- **Performance:** Mensch ~78%, GPT-4 Agents anfangs 14%, OpenAI CUA jetzt ~58%
- **BALAGE-Relevanz:** Gering (Task-Completion-Benchmark, nicht Element-Detection)
- **Quelle:** https://webarena.dev/

#### VisualWebArena (2024)
- **Was:** 910 Tasks die visuelles Verstaendnis erfordern
- **Technik:** Set-of-Marks (SoM) Prompting: JavaScript annotiert interactable Elements mit Bounding Boxes + unique IDs auf Screenshots
- **Performance:** Beste VLM Agents bei 16.4%, Menschen bei 88.7%
- **BALAGE-Relevanz:** SoM-Konzept (Elemente mit IDs markieren bevor LLM sie sieht) ist direkt auf BALAGE's DOM-Serialisierung uebertragbar
- **Geschaetzter F1-Impact:** +2-3% (bessere Element-Referenzierung im LLM-Prompt)
- **Aufwand:** Niedrig
- **Quelle:** https://jykoh.com/vwa

#### ScreenSpot / ScreenSpot-Pro (2025)
- **Was:** GUI Grounding Benchmark (Web, Mobile, Desktop), Pro-Version mit 1,581 Tasks fuer professionelle Software
- **BALAGE-Relevanz:** Gering (visuell)
- **Quelle:** OSU-NLP-Group

#### GUI-Agents-Paper-List (laufend aktualisiert)
- **Was:** Umfassende, kuratierte Liste aller GUI Agent Papers, sortiert nach Thema
- **BALAGE-Relevanz:** Exzellente Referenz fuer zukuenftige Recherche
- **Quelle:** https://github.com/OSU-NLP-Group/GUI-Agents-Paper-List

---

## 3. Techniken die BALAGE verbessern koennten

### 3.1 HIGHEST IMPACT: GNN Pre-Filter + LLM (Klarna-Ansatz)

**Was:** Graph Neural Network (GCN) auf DOM-Baum trainieren, das relevante Elemente vorselektiert. Nur diese gefilterten Elemente gehen dann ans LLM.

**Wie es BALAGE verbessert:**
- Klarna-Paper zeigt: GCN + LLM = +16.8 Prozentpunkte vs. LLM-only
- BALAGE's aktuelle Pipeline: Segment -> alle Elemente ans LLM. GNN wuerde die relevanten Elemente (Login-Form, Search-Bar, Cart-Button) vorher identifizieren
- Drastische Reduktion der LLM-Token (nur relevante Nodes statt ganzes Segment)
- Kostenreduktion und Geschwindigkeitsgewinn

**Geschaetzter F1-Impact:** +8-15%
**Implementierungsaufwand:** Hoch (4-6 Wochen)
- DOM-Baum als Graph reprasentieren (Nodes = HTML-Elemente, Edges = parent-child + sibling)
- Node-Features: Tag, Attributes, Text, Position im Baum
- Training: Klarna Dataset als Startpunkt, eigener Benchmark als Fine-Tuning
- Inferenz: GCN markiert "relevante" Nodes, nur diese gehen ans LLM

**Quelle:** https://arxiv.org/abs/2111.02168

### 3.2 HIGH IMPACT: HTML-to-Markdown als Pre-Processing

**Was:** Statt BALAGE's custom DOM-Pruner den HTML-String erst durch ReaderLM-v2 in sauberes Markdown konvertieren lassen, dann das Markdown dem LLM geben.

**Wie es BALAGE verbessert:**
- ReaderLM-v2 (1.5B) uebertrifft GPT-4o um 15-20% bei HTML-Cleanup
- Markdown ist wesentlich token-effizienter als geprunter HTML
- LLM sieht saubereren, strukturierteren Input
- Eliminiert Noise aus CSS-Klassen, verschachtelten Divs, etc.
- Koennte lokal laufen (1.5B Modell) = keine API-Kosten fuer Pre-Processing

**Geschaetzter F1-Impact:** +5-8%
**Implementierungsaufwand:** Niedrig (1-2 Wochen)
- ReaderLM-v2 als lokales Modell deployen oder Jina Reader API nutzen
- HTML -> Markdown -> LLM-Prompt statt HTML -> DOM-Prune -> Serialize -> LLM-Prompt
- Beide Ansaetze koennten parallel laufen und Ergebnisse mergen

**Quelle:** https://huggingface.co/jinaai/ReaderLM-v2

### 3.3 HIGH IMPACT: Accessibility Tree als Input

**Was:** Statt raw HTML den Accessibility Tree als (zusaetzlichen) Input nutzen.

**Wie es BALAGE verbessert:**
- Accessibility Tree ist 80-90% kleiner als raw DOM (Stagehand-Erfahrung)
- Semantisch reicher: jedes Element hat role, name, state (statt CSS-Klassen)
- Stabil ueber Layout-Aenderungen hinweg
- Playwright MCP (Microsoft, 2025) nutzt A11y Tree als primaeres Interface
- WorkArena nutzt A11y Tree statt DOM fuer "cleaner observation space"

**Geschaetzter F1-Impact:** +4-7%
**Implementierungsaufwand:** Mittel (2-3 Wochen)
- Problem: BALAGE arbeitet OHNE Browser -- A11y Tree braucht normalerweise Rendering
- Loesung 1: Optionaler Browser-Mode (Playwright/CDP), A11y Tree extrahieren
- Loesung 2: A11y Tree aus HTML simulieren (ARIA-Rollen, semantische Tags, Formular-Assoziationen parsen). BALAGE tut dies teilweise bereits in `aria-parser.ts`
- Loesung 3: Hybrid -- wenn Browser verfuegbar, A11y Tree nutzen; sonst Heuristik-Fallback

**Quelle:** https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree

### 3.4 HIGH IMPACT: Self-Training / Active Learning mit Benchmark

**Was:** BALAGE's 20-Site-Benchmark als Seed-Dataset nutzen, dann Self-Training auf hunderten weiteren Sites.

**Wie es BALAGE verbessert:**
- BALAGE hat aktuell 20 gelabelte Sites -- zu wenig fuer robustes Training
- Self-Training Workflow:
  1. BALAGE analysiert 500 ungelabelte Sites
  2. High-Confidence Ergebnisse (>0.85) werden als Pseudo-Labels verwendet
  3. Model wird auf erweitertem Dataset re-trained/re-tuned
  4. Iteration bis Convergenz
- EMNLP 2024: Self-Training erreicht gleiche Resultate mit nur 25% der Daten

**Geschaetzter F1-Impact:** +5-10%
**Implementierungsaufwand:** Mittel (2-3 Wochen)
- Step 1: 500 Top-Websites crawlen (Tranco-Liste)
- Step 2: BALAGE im LLM-Mode auf allen 500 laufen lassen
- Step 3: High-Confidence Ergebnisse als Training-Signal nutzen
- Step 4: Heuristik-Regeln und/oder Fine-Tuned-Modell verbessern

**Quelle:** https://aclanthology.org/2024.emnlp-main.669/

### 3.5 MEDIUM IMPACT: Prompt-Engineering-Verbesserungen

#### 3.5.1 Set-of-Marks im DOM-Serialisierung
- **Was:** Jedem interaktiven Element eine eindeutige numerische ID geben im serialisierten DOM (wie browser-use's Indexing)
- **Aktuell:** BALAGE serialisiert DOM als Text-Baum ohne Element-IDs
- **Verbesserung:** `[E1] <button>Login</button>` statt `<button>Login</button>`
- **Impact:** +2-3%, Aufwand: Niedrig (1 Tag)

#### 3.5.2 Chain-of-Thought Prompting
- **Was:** LLM soll erst die Seitenstruktur analysieren, dann Endpoints identifizieren
- **Aktuell:** BALAGE nutzt Few-Shot, kein explizites CoT
- **Verbesserung:** "First, describe the page structure. Then, identify interactive regions. Finally, classify each region."
- **Impact:** +1-3%, Aufwand: Niedrig (Prompt-Anpassung)

#### 3.5.3 Structured Output mit JSON Schema Enforcement
- **Was:** LLM-Response Format strikt via JSON Schema erzwingen (OpenAI Structured Outputs)
- **Aktuell:** BALAGE nutzt Zod-Validation post-hoc
- **Verbesserung:** `response_format: { type: "json_schema", json_schema: ... }` im API-Call
- **Impact:** +1-2% (weniger Parse-Fehler), Aufwand: Niedrig

### 3.6 MEDIUM IMPACT: Fine-Tuning eines kleinen Modells

**Was:** DistilBERT (66M) oder TinyLlama (1.1B) auf BALAGE's spezifische Aufgabe fine-tunen.

**Wie es BALAGE verbessert:**
- Aktuell: gpt-4o-mini bei $0.002/Seite. Ein Fine-Tuned-Modell koennte lokal laufen bei $0/Seite
- DistilBERT: 40% kleiner, 60% schneller als BERT, behaelt 95% Performance
- TinyLlama: Thrives auf fokussierten, hochqualitativen Daten
- Training-Daten: 20 Benchmark-Sites + Self-Training-Erweiterung

**Geschaetzter F1-Impact:** +3-8% (bei genuegend Training-Daten) oder -5% (bei zu wenig Daten)
**Implementierungsaufwand:** Hoch (3-5 Wochen)
- Dataset: Min. 200 gelabelte Seiten (via Self-Training erreichbar)
- Input: Serialisierter DOM-Auszug (wie aktueller LLM-Input)
- Output: Endpoint-Typ + Confidence
- Risk: Overfitting bei kleinem Dataset

**Quelle:** https://huggingface.co/docs/transformers/en/model_doc/distilbert

### 3.7 MEDIUM IMPACT: CSS-Layout-Heuristics

**Was:** CSS-Properties als zusaetzliche Features fuer Klassifikation nutzen.

**Wie es BALAGE verbessert:**
- Position auf der Seite korreliert stark mit Funktion (Header -> Nav/Auth, Footer -> Legal, Center -> Content/Form)
- z-index korreliert mit Overlays/Modals (Cookie-Banner, Login-Popups)
- Element-Groesse korreliert mit Wichtigkeit
- Aktuell: BALAGE's Pruner ignoriert CSS-Layout komplett

**Geschaetzter F1-Impact:** +3-5%
**Implementierungsaufwand:** Mittel (1-2 Wochen)
- Problem: BALAGE hat kein Rendering, also keine computed Styles
- Loesung: Inline-Styles parsen, CSS-Klassen mit bekannten Frameworks matchen (Bootstrap `col-md-6`, Tailwind `fixed top-0`)
- z-index aus inline-style oder bekannten CSS-Klassen extrahieren
- Position-Heuristiken: erstes `<nav>` = Header-Nav, letztes = Footer-Nav

**Quelle:** https://www.mdpi.com/2673-2688/6/9/228

### 3.8 LOW-MEDIUM IMPACT: Annotated Semantic Graph

**Was:** DOM-Nodes mit semantischen Labels anreichern bevor sie ans LLM gehen (Aime-Ansatz).

**Wie es BALAGE verbessert:**
- Statt rohem `<div class="xyz">` -> `[FORM_CONTAINER] <div class="xyz">`
- Pre-Annotation gibt dem LLM Kontext ueber die funktionale Rolle jedes Elements
- Koennte mit Heuristik-Gate kombiniert werden: sichere Annotationen vor LLM-Call

**Geschaetzter F1-Impact:** +2-4%
**Implementierungsaufwand:** Niedrig-Mittel (1 Woche)

### 3.9 LOW IMPACT: browser-use DOM Pruning Strategie adaptieren

**Was:** browser-use's 4-Stage Pipeline Konzepte auf BALAGE's HTML-only Kontext adaptieren.

**Spezifisch uebertragbar:**
- Paint Order Simulation: z-index aus Inline-Styles/bekannten CSS-Klassen ableiten
- Bounding Box Collapse: Verschachtelte klickbare Elemente zu Parent kollabieren
- Interactive Element Heuristics: ARIA Roles + CSS cursor + Event Handler Attribute

**Geschaetzter F1-Impact:** +1-3%
**Implementierungsaufwand:** Niedrig (3-5 Tage)

---

## 4. Competitor-Analyse

### 4.1 Element Detection Vergleich

| Tool | DOM-basiert | Vision-basiert | Braucht Browser | Element Detection |
|------|-----------|---------------|----------------|-------------------|
| **BALAGE** | Ja (HTML-only) | Nein | Nein | Heuristic + LLM |
| **browser-use** | Ja (CDP) | Optional | Ja | 4-Stage CDP Pipeline |
| **Stagehand** | Ja (A11y Tree) | Nein | Ja | Candidate Elements + Chunking |
| **Skyvern** | Nein | Ja (CV + LLM) | Ja | Computer Vision |
| **LaVague** | Indirekt | Nein | Ja | LLM-basiert |
| **Aime** | Ja (Semantic Graph) | Ja | Ja | JS Injection + VLM |
| **Index** | Nein | Ja (Vision LLM) | Ja | Reasoning LLM |
| **OmniParser** | Nein | Ja | Optional | Detection + Captioning |

### 4.2 BALAGE's einzigartige Position

BALAGE ist das **einzige Tool das ohne Browser auf raw HTML arbeitet**. Das ist sowohl Staerke als auch Schwaeche:

**Staerken:**
- Kein Browser-Overhead (Latenz, Kosten, Infrastruktur)
- Kann auf gespeichertem/gecachtem HTML arbeiten
- Kein Rendering noetig = viel schneller
- Einfacher zu deployen (kein Puppeteer/Playwright Setup)

**Schwaechen:**
- Kein Zugriff auf Accessibility Tree (ohne Browser)
- Kein Zugriff auf berechnete Styles (kein CSS Layout)
- Kein Zugriff auf JavaScript-gerenderten Content (SPAs)
- Keine visuellen Features (Farbe, Position, Groesse)

### 4.3 Benchmark-Methoden Vergleich

| Benchmark | Methode | Best Performance |
|-----------|---------|-----------------|
| WebVoyager | Task Completion | Aime 92.34%, Index 92%, browser-use 89.1% |
| WebArena | Task Completion | OpenAI CUA ~58%, Humans ~78% |
| VisualWebArena | Visual Tasks | VLM Agents 16.4%, Humans 88.7% |
| ScreenSpot | Element Grounding | OmniParser+GPT-4o 39.6% |
| Mind2Web | Action Prediction | Verschiedene, DOM+A11y+Screenshot |

---

## 5. Spezifische Loesungen fuer BALAGE's Schwaechen

### 5.1 Search Forms die als Checkout aussehen (Date-Picker Problem)

**Problem:** Hotel/Flug-Suchformulare mit Date-Pickern werden als Checkout klassifiziert weil sie aehnliche UI-Elemente haben.

**Loesungen:**
1. **Form-Action-URL Analyse** (bereits teilweise implementiert): `/search` vs. `/checkout` im form action
2. **Button-Label Disambiguation:** "Search" vs. "Book Now" vs. "Pay" -- die finalen Submit-Buttons unterscheiden sich
3. **Input-Type-Analyse:**
   - Search: typischerweise 1-2 Text-Inputs + Date-Picker + Dropdown (Ort/Gaeste)
   - Checkout: typischerweise viele Inputs (Name, Adresse, Kreditkarte, CVV)
   - Heuristik: `inputCount > 6 AND hasPaymentInput` -> Checkout, sonst Search
4. **Payment-Indicator Suche:** Kreditkarten-Felder (`autocomplete="cc-number"`, `name="card"`, `type="tel" pattern="[0-9]"`)
5. **Schema.org Markup:** `itemtype="https://schema.org/SearchAction"` vs. `CheckoutAction`

**Geschaetzter F1-Impact:** +3-5% auf search/checkout Disambiguation
**Aufwand:** Niedrig (1-2 Tage, Heuristik-Erweiterung)

### 5.2 Cookie-Consent vs. Settings-Panels

**Problem:** Cookie-Settings-Panels mit Toggles werden als "settings" statt "consent" klassifiziert.

**Loesungen:**
1. **Kontext-Hierarchie:** Cookie-Settings sind INNERHALB eines Cookie-Banners -- wenn Parent-Element consent-Signale hat, ist das Kind auch consent
2. **Button-Label-Analyse:** "Save preferences" in Cookie-Kontext = consent, "Save preferences" in Account-Kontext = settings
3. **Z-Index / Overlay-Erkennung:** Cookie-Banner haben typisch hohen z-index oder `position: fixed`
4. **BERT-basierte Klassifikation** (USENIX 2024): Trainiertes Modell speziell fuer Cookie-UI-Elemente mit 95.1% Accuracy
5. **Bereits implementiert:** BALAGE hat `hasConsentButtons` und `hasCookieConsent` Checks -- koennte erweitert werden um Parent-Element-Kontext zu beruecksichtigen

**Geschaetzter F1-Impact:** +2-4%
**Aufwand:** Niedrig (erweitere `collectDomSignals` um Parent-Kontext)

### 5.3 SPA-rendered Content (React/Angular/Vue)

**Problem:** BALAGE arbeitet auf static HTML. SPAs liefern minimal HTML + JavaScript-Rendering.

**Loesungen:**
1. **Framework Detection** (bereits implementiert in `detect-framework.ts`):
   - React: `<div id="root">`, `data-reactroot`, `__NEXT_DATA__`
   - Angular: `ng-version`, `_ngcontent-*`
   - Vue: `data-v-*`, `__VUE__`
2. **SSR-Output nutzen:** Viele SPAs haben Server-Side Rendering (Next.js, Nuxt, Angular Universal) -- das statische HTML enthaelt bereits die gerenderten Elemente
3. **Leerer-Root-Detection:** Wenn `<div id="root"></div>` leer ist, Signal an den Caller: "SPA detected, consider providing rendered HTML"
4. **Optional: Headless Browser Mode:** Playwright/Puppeteer als optionale Dependency, `page.content()` nach SPA-Rendering aufrufen
5. **State-Attribute:** SPAs speichern oft State in `data-*` oder `__NEXT_DATA__` Attributen -- diese koennen strukturelle Hinweise geben

**Geschaetzter F1-Impact:** +5-10% auf SPA-Heavy Websites
**Aufwand:** Niedrig fuer Detection, Mittel fuer optionalen Browser-Mode

---

## 6. Priorisierte Roadmap

### Phase 1: Quick Wins (1-2 Wochen, F1 +5-10%)

| Aktion | F1 Impact | Aufwand | Beschreibung |
|--------|-----------|---------|--------------|
| Element-IDs im Serializer | +2-3% | 1 Tag | Set-of-Marks Konzept auf DOM-Output |
| Payment-Field Detection | +2-3% | 1 Tag | `autocomplete="cc-*"` als Checkout-Signal |
| Parent-Kontext fuer Consent | +1-2% | 1 Tag | consent-Signale von Parent propagieren |
| JSON Schema Enforcement | +1-2% | 1 Tag | OpenAI Structured Output nutzen |
| Search/Checkout Disambiguation | +2-3% | 2 Tage | Input-Count + Payment-Indicator Heuristik |

### Phase 2: Mittelfristig (3-5 Wochen, F1 +8-15%)

| Aktion | F1 Impact | Aufwand | Beschreibung |
|--------|-----------|---------|--------------|
| ReaderLM-v2 Pre-Processing | +5-8% | 1-2 Wochen | HTML -> Markdown als alternativer Pipeline-Pfad |
| Self-Training Pipeline | +5-10% | 2-3 Wochen | 500-Site Crawl, Pseudo-Labels, Re-Training |
| Annotated Semantic Graph | +2-4% | 1 Woche | DOM-Nodes mit Funktions-Labels anreichern |

### Phase 3: Langfristig (6-12 Wochen, F1 +10-20%)

| Aktion | F1 Impact | Aufwand | Beschreibung |
|--------|-----------|---------|--------------|
| GNN Pre-Filter | +8-15% | 4-6 Wochen | GCN auf DOM-Baum, relevante Nodes vorselektieren |
| Fine-Tuned Classifier | +3-8% | 3-5 Wochen | DistilBERT/TinyLlama auf BALAGE-Dataset |
| A11y Tree Simulation | +4-7% | 2-3 Wochen | Accessibility Tree aus HTML rekonstruieren |
| CSS Layout Heuristics | +3-5% | 1-2 Wochen | Inline Styles + Framework-Klassen als Features |

### Theoretische Gesamt-F1-Prognose

- **Aktuell:** F1 = 73%
- **Nach Phase 1:** F1 ~ 78-83%
- **Nach Phase 2:** F1 ~ 83-88%
- **Nach Phase 3:** F1 ~ 88-93%

*Hinweis: F1-Verbesserungen sind NICHT additiv. Diminishing Returns sind zu erwarten ab F1 > 85%.*

---

## 7. Quellen

### Akademische Papers
- [ShowUI - CVPR 2025](https://github.com/showlab/ShowUI)
- [UGround - ICLR 2025 Oral](https://github.com/OSU-NLP-Group/UGround)
- [SeeClick - GUI Grounding](https://www.semanticscholar.org/paper/SeeClick:-Harnessing-GUI-Grounding-for-Advanced-GUI-Cheng-Sun/f9b39a6a7e40986b46f7796f3a805d70d7e3931a)
- [CogAgent - CVPR 2024](https://www.researchgate.net/publication/384235870_CogAgent_A_Visual_Language_Model_for_GUI_Agents)
- [DOM-LM](https://arxiv.org/abs/2201.10608)
- [MarkupLM - ACL 2022](https://aclanthology.org/2022.acl-long.420.pdf)
- [WebFormer - WWW 2022](https://arxiv.org/abs/2202.00217)
- [Klarna Product Page Dataset](https://arxiv.org/abs/2111.02168)
- [DOM-Q-NET - ICLR 2019](https://arxiv.org/abs/1902.07257)
- [Pix2Struct - ICML 2023](https://arxiv.org/abs/2210.03347)
- [Cookie Consent Classification - USENIX 2024](https://www.usenix.org/system/files/usenixsecurity24-bouhoula.pdf)
- [Phishing DOM Graph Detection](https://www.mdpi.com/2079-9292/13/16/3344)
- [Self-Training Active Learning - EMNLP 2024](https://aclanthology.org/2024.emnlp-main.669/)
- [Mind2Web - NeurIPS 2023](https://github.com/OSU-NLP-Group/Mind2Web)
- [WebSAM-Adapter 2024](https://link.springer.com/chapter/10.1007/978-3-031-56027-9_27)
- [Beyond DOM: Source Code Neural Networks](https://www.mdpi.com/2673-2688/6/9/228)
- [VisualWebArena](https://jykoh.com/vwa)
- [GUI Agents Survey](https://arxiv.org/html/2411.04890v2)
- [Hierarchical Webpage Pre-training](https://arxiv.org/html/2402.18262v1)

### Open-Source Tools
- [browser-use](https://github.com/browser-use/browser-use) / [DOM Processing Engine](https://deepwiki.com/browser-use/browser-use/2.4-dom-processing-engine)
- [Stagehand](https://github.com/browserbase/stagehand)
- [Skyvern](https://github.com/Skyvern-AI/skyvern)
- [LaVague](https://github.com/lavague-ai/LaVague)
- [Aime Browser-Use](https://aime-browser-use.github.io/)
- [Index (lmnr-ai)](https://github.com/lmnr-ai/index)
- [OmniParser V2 (Microsoft)](https://github.com/microsoft/OmniParser)
- [Firecrawl](https://github.com/firecrawl/firecrawl)
- [ReaderLM-v2 (Jina)](https://huggingface.co/jinaai/ReaderLM-v2)
- [Klarna Product Page Dataset](https://github.com/klarna/product-page-dataset)
- [GUI-Agents-Paper-List](https://github.com/OSU-NLP-Group/GUI-Agents-Paper-List)

### Markt & Vergleiche
- [State-of-the-Art Autonomous Web Agents 2024-2025](https://medium.com/@learning_37638/state-of-the-art-autonomous-web-agents-2024-2025-3d9d93a5dde2)
- [11 Best AI Browser Agents 2026](https://www.firecrawl.dev/blog/best-browser-agents)
- [Skyvern Blog: How Skyvern Reads the Web](https://www.skyvern.com/blog/how-skyvern-reads-and-understands-the-web/)
- [browser-use SOTA Technical Report](https://browser-use.com/posts/sota-technical-report)
- [Stagehand v3 Announcement](https://www.browserbase.com/blog/stagehand-v3)
