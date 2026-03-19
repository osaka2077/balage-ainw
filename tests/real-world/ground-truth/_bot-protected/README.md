# Bot-Protected Sites (archiviert)

Diese Ground-Truth-Files wurden aus dem aktiven Benchmark entfernt weil die
Sites aggressives Bot-Protection nutzen (DataDome, Microsoft Login-Redirect)
und Headless Chromium kein echtes HTML erhaelt.

Entscheidung dokumentiert in: .ai/decisions_log.md (ADR-010)

Sites:
- outlook-login: Microsoft blockt Headless komplett (leeres HTML)
- paypal-signin: DataDome CAPTCHA
- etsy-main: DataDome CAPTCHA

Koennen reaktiviert werden wenn ein "adversarial" Benchmark-Modus implementiert wird.
