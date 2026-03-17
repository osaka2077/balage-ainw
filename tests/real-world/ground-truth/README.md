# Ground Truth — Real-World Benchmark Websites

Manuell erstellte Ground-Truth-Daten fuer 10 echte Websites.
Dienen zur Messung von Precision, Recall und F1-Score des Endpoint-Discovery.

## Websites

| Datei | URL | Difficulty | Endpoints |
|-------|-----|-----------|-----------|
| `github-login.json` | github.com/login | easy | 5 |
| `wikipedia-main.json` | en.wikipedia.org | easy | 5 |
| `hacker-news.json` | news.ycombinator.com | easy | 5 |
| `linkedin-login.json` | linkedin.com/login | easy | 5 |
| `stripe-docs.json` | docs.stripe.com | medium | 6 |
| `shopify-demo.json` | Shopify Dawn Demo | medium | 6 |
| `booking-main.json` | booking.com | hard | 6 |
| `airbnb-main.json` | airbnb.com | hard | 7 |
| `amazon-de-main.json` | amazon.de | extreme | 8 |
| `angular-material-demo.json` | material.angular.io | extreme | 7 |

## JSON-Format

```json
{
  "url": "https://example.com",
  "captured_at": "2026-03-17",
  "difficulty": "easy | medium | hard | extreme",
  "notes": "Beschreibung der Seite und Besonderheiten",
  "endpoints": [
    {
      "type": "auth | form | checkout | navigation | support",
      "label": "Kurzname",
      "description": "Was der Endpoint tut",
      "selector_hint": "CSS-Selektor als Orientierung",
      "affordances": ["fill", "submit", "click", "select", "hover", "scroll", "expand"],
      "risk_class": "low | medium | high",
      "fields": ["field_name_1", "field_name_2"],
      "phase": 1
    }
  ],
  "expected_metrics": {
    "total_endpoints": 5,
    "phase1_endpoints": 2,
    "min_precision_target": 0.70,
    "min_recall_target": 0.60
  }
}
```

## Felder

- **type:** Endpoint-Kategorie. Phase 1 (MVP): `auth`, `form`, `checkout`, `support`. Phase 2: `navigation` und Rest.
- **phase:** `1` = MVP-relevanter Typ, `2` = spaetere Phase.
- **difficulty:** Wie schwer die Seite fuer automatische Endpoint-Discovery ist.
  - `easy`: Einfaches HTML, semantische Struktur, wenig JS
  - `medium`: SPA oder dynamische Inhalte, aber klare Struktur
  - `hard`: Komplexe Formulare, A/B-Testing, viel JS, Cookie-Banner
  - `extreme`: Shadow DOM, tausende DOM-Elemente, verschachtelte Dynamik
- **selector_hint:** Kein garantierter Selektor — nur Orientierung fuer manuelle Verifikation.
- **risk_class:** `high` = Auth/Checkout (destruktiv), `medium` = Daten-Aenderung, `low` = Read-only.
- **expected_metrics:** Realistische Ziele basierend auf Website-Difficulty.
