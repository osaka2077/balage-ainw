# Changelog

All notable changes to `balage-core` are documented in this file.

## [0.6.0] - 2026-03-27

### Added
- Dynamic SAFETY_CAP for balanced precision/recall (replaces fixed cap)
- Segment-level multi-run majority vote (`BALAGE_RUNS` env var) for LLM stabilization
- Post-processing pipeline: 5 modular stages extracted from endpoint generator
- `verify()` and `verifyFromHTML()` for post-action verification
- Ensemble mode: heuristic + LLM run in parallel with reconciler
- Confidence-gap cutoff replaces fixed endpoint cap
- MCP input size guard (2MB limit)
- Security headers on REST API, body-limit, env-template
- 922 tests (up from 607)

### Changed
- Heuristic-analyzer extracted from analyze.ts (845 -> 285+589 LOC)
- Navigation cap: 5 -> 4, Content cap: 3 -> 2
- Gap threshold tuned (MIN_ENDPOINTS 3 -> 5, threshold 0.10 -> 0.12)
- Few-shot examples moved to system prompt for OpenAI prompt caching
- Selective semantic attributes and class/id/name retention in DOM pruner
- Bipartite matching replaces greedy matching in benchmark scoring

### Fixed
- Zendesk support-type detection
- Booking travel-search misclassification
- Over-detection regression (dynamic SAFETY_CAP)
- SSO-button splitting and auth/nav dedup
- Consent-vs-settings classification
- Type-based slot matching in majority-vote (was label-based)
- npm audit: 0 vulnerabilities

## [0.5.0-alpha.1] - 2026-03-26

### Added
- Heuristic-first gate: skip LLM for high-signal segments
- SSO-button splitting and extended type-correction layer
- 3 pipeline quick-wins: consent-vs-settings, nav whitelist, footer-to-nav
- Precision tuning: raised confidence floor, reduced endpoint caps
- Multi-field search form detection for booking/travel sites
- Page-context and search-evidence in LLM prompt

### Changed
- Heuristic-analyzer extracted from analyze.ts (845 -> 285+589 LOC)

### Fixed
- esbuild __name polyfill for fixture mode
- SPA hydration blocked in fixture mode
- Auth/nav endpoint dedup by label (SSO duplicates)
- Stronger consent detection, reduced over-detection

## [0.4.0-alpha.1] - 2026-03-24

### Added
- `verify()` hardening: type declarations, MCP tool, scoring tests
- Verify pipeline coverage: error strategy, cookie, network, E2E tests
- Few-shot examples moved to system prompt for OpenAI caching
- Calibrated hallucination checks for commerce/consent/settings/nav
- Selective semantic attributes in DOM pruner
- Multi-run mode (`BALAGE_RUNS=N`) for statistical validation

### Changed
- Ground-truth corrections and bug fixes: F1 59.7% -> 65.3% (+5.6pp)

### Fixed
- 2 regression bugs + 6 F1 optimizations for recall improvement
- aria-hidden visibility, autocomplete tokens, consent detection

## [0.3.0-alpha.1] - 2026-03-22

### Added
- Fingerprint-cache: deterministic results for known pages (100% hit = 0ms, $0)
- Precision-boost: 4 targeted fixes to reduce false positives

### Changed
- Ground-truth normalization and dedup tuning for F1 improvement

### Fixed
- Reverted sub-segmentation regression, kept type-fixes only
- Fixture-first mode: no more ERR_INTERNET_DISCONNECTED

## [0.2.0-alpha.1] - 2026-03-20

### Added
- `verify()` for post-action verification of browser agent actions
- MCP Server (`balage-mcp`) with 3 tools for AI agents
- Lazy LLM SDK imports: no more "Cannot find module 'openai'" for heuristic users

### Changed
- 3 systemic F1 fixes: nav dedup, settings detection, commerce recognition
- ESLint cleanup: 70 -> 0 warnings
- Refactored shared_interfaces.ts, removed dead code

### Fixed
- Package name corrected (@balage/core -> balage-core)
- LLM default corrected in docs, exports order fixed

## [0.1.0-alpha.1] - 2026-03-18

### Added
- Initial release
- `analyzeFromHTML()`: heuristic + LLM endpoint detection
- `detectFramework()`: WordPress, Shopify, React, Next.js, Angular, Vue, Svelte, Salesforce
- `htmlToDomNode()`: browser-free HTML parsing
- Confidence scoring with evidence chains
- TypeScript types and ESM/CJS dual package
- MIT license
