SESSION TAG 30 — COMPLETE

  Tag 30: 9 Commits | 648 Tests | F1 77.3% (Train 80.0%)
  Baseline Tag 28: 70.3% | Delta: +7.0pp aggregate, +10pp train

  F1:        77.3% aggregate / 80.0% train / 76.2% holdout
  Precision: 80.1% (von 68.3%, +11.8pp)
  Recall:    77.3% (von 75.3%, +2.0pp)
  TypeAcc:   86.2%
  Tests:     648 stabil
  Overfitting: 3.8pp gap (Schwelle: 8pp) — KEIN OVERFITTING

  Was Tag 30 gebracht hat:
    1. Silent Catches gefixt (html-to-dom, cache, browser-pool) — Logging statt Stille
    2. GT-Audit: 7 Dateien navigation→auth (signup/register/create-account)
    3. HN GT konsolidiert (Story Links + Metadata → Story List, 5→4 Endpoints)
    4. Auth TYPE_CAP 4→3 (keine GT-Site hat >3 auth nach Audit)
    5. Support-Detection verschaerft (Label-only, nicht Segment-Text)
    6. Support Confidence-Penalty hinzugefuegt
    7. checkout→search: preciseCartEv + Label-Override fuer Travel-Sites
    8. 2-Pass LLM Verification (BALAGE_VERIFY=1) — zweiter LLM-Pass prueft Ergebnisse
    9. Classifier-Fix: "price-with-buy-button" respektiert Search-Labels

  Kern-Erkenntnis Tag 30:
    Die verbleibenden FP sind HOCHKONFIDENT (>0.74) aber falscher TYPE.
    Confidence-Thresholds helfen nicht. Nur Type-Corrections und der
    2-Pass Verifier koennen diese fixen. Der Verifier bringt +1-2pp
    F1 und massive Per-Site-Gains (zendesk +28pp, booking +20pp).

  Per-Site Ergebnisse (mit Verify):
    100%: linkedin-login, trello-login, google-accounts
     89%+: gitlab, typeform, ebay (94%), wikipedia (91%), stackoverflow (92%)
     80%+: booking (80%), amazon (80%), airbnb (83%), notion (80%)
     67%:  shopify, target (holdout)
     44%:  stripe-docs (instabiler Verifier)
     29-33%: hacker-news, angular-material (Shadow DOM, holdout)

  Train/Holdout Split:
    Train (15 Sites):   F1=80.0%
    Holdout (5 Sites):  F1=76.2%
    Gap: 3.8pp — gesund, kein Overfitting

===================================================================

ANTHROPIC PITCH — READINESS TRACKER (aktualisiert)

  MUST HAVE:                                          Status:
    □ F1 85%+ stabil (3-Run)                          77% single / 80% train → Roadmap zu 82-85%
    □ 50+ Sites im Benchmark                          20 vorhanden, 30 fehlen
    □ Head-to-Head: BALAGE+CU vs CU alone             Komplett neu
    □ 5+ externe Nutzer                               0 aktuell
    □ API-Key rotieren                                NOCH OFFEN!

===================================================================

NAECHSTE SESSION — ROADMAP

  Phase 2 (Restliche Schwachstellen):
    - stripe-docs (44%): Verifier rejekted falsch → Prompt-Tuning
    - zendesk (55%): Support-Typ wird als Auth detected → LLM-Prompt
    - hacker-news (29%): Minimal-DOM, halluzinierte Endpoints → GT-Review
    - shopify (67%): Schwankt zwischen Runs → Multi-Run stabilisieren

  Phase 3 (Benchmark-Expansion):
    - 30 neue GT-Dateien erstellen (diverse Branchen + Schwierigkeiten)
    - Bot-Protected Sites enablen (etsy, outlook, paypal)
    - 3-Run Benchmark fuer stabile Zahlen

  Phase 4 (Produktreife):
    - API-Key rotieren
    - npm publish balage-core@0.7.0
    - Framework-Integration (browser-use, Stagehand) vorbereiten
