# Changelog

## [0.7.0] - 2026-03-30

### Added
- `analyzeFromURL(url, options?)` — fetch + analyze in one call
- Firecrawl adapter (serverless, no browser needed)
- Playwright adapter (local browser, auto-fallback)
- Auto-detection: Firecrawl if API key set, else Playwright
- 2-Pass LLM Verification (`BALAGE_VERIFY=1`)
- Markdown-enhanced LLM pipeline (`BALAGE_MARKDOWN_CONTEXT=1`)
- Page-type classifier (e-commerce, travel, saas, docs, news, login)
- SSRF protection (17 attack vectors blocked)
- API key redaction in all error paths
- Response size limits (5MB default)
- Cost limiter for Firecrawl calls (10/min, 100/h)
- HTML comment stripping before LLM calls
- Credential scanning on endpoint output
- Head-to-Head benchmark: 18x cheaper, 3x faster than Computer Use
- 50-site benchmark (from 20)
- Capture pipeline (`scripts/capture-fixtures.ts`)
- GT skeleton generator (`scripts/generate-gt-skeletons.ts`)
- Security guide (`docs/security/FIRECRAWL-SECURITY-GUIDE.md`)
- Integration examples (`examples/firecrawl-integration/`)

### Changed
- F1: 55-65% → 76.8% (50 sites)
- Precision: 65% → 78.8%
- Tests: 649 → 1323
- Auth TYPE_CAP: 4 → 3
- Content/Media TYPE_CAP: 2 → 1
- Support detection tightened (label-only, not segment text)
- checkout→search: uses preciseCartEv for travel sites
- Booking.com classifier fix (search not checkout)

### Fixed
- Silent catch blocks (html-to-dom, cache, browser-pool)
- GT audit: 7 files navigation→auth (signup/register)
- Redirect-SSRF in FirecrawlFetcher
- Stripe test API keys redacted from fixtures

## [0.6.0] - 2026-03-28

### Added
- Cross-segment anchor dedup
- OpenAI Structured Outputs support (json_schema)
- Settings→navigation correction for theme/category/currency
- Segment pre-filter for footer/header/modal/overlay/sidebar
- 5-agent GitNexus deep analysis

### Fixed
- stddev benchmark calculation (Bessel's correction)
- 4 security findings (SSRF, bounded stores, WS validation)
