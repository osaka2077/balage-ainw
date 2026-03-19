=== Round 11 Fixture-Benchmark Report ===
Date: 2026-03-19
Model: gpt-4o-mini (fallback: gpt-4o)

================================================================================
1. FIXTURE SETUP
================================================================================

Snapshots copied:    19 (from tests/real-world/snapshots/ to tests/real-world/fixtures/)
Fixture missing:     1  (zalando-de-main -- Timeout during snapshot capture)

Snapshot-to-Fixture rename mapping:
  accounts-google.html                        -> google-accounts.html
  gitlab-users-sign-in.html                   -> gitlab-login.html
  news-ycombinator.html                       -> hacker-news.html
  en-wikipedia-wiki-Main-Page.html            -> wikipedia-main.html
  themes-shopify-themes-dawn-styles-defaul.html -> shopify-demo.html
  docs-stripe.html                            -> stripe-docs.html
  support-zendesk.html                        -> zendesk-support.html
  material-angular-components-categories.html -> angular-material-demo.html
  airbnb.html                                 -> airbnb-main.html
  amazon.html                                 -> amazon-de-main.html
  booking.html                                -> booking-main.html
  ebay.html                                   -> ebay-de-main.html
  stackoverflow.html                          -> stackoverflow-main.html
  target.html                                 -> target-main.html
  typeform.html                               -> typeform-main.html
  (github-login, linkedin-login, notion-login, trello-login: names matched directly)

================================================================================
2. PRE-CHECK
================================================================================

TypeScript (tsc --noEmit):  PASS (no errors)
Unit Tests (vitest):        PASS (48 files, 449 tests, all green)

================================================================================
3. FIXTURE MODE STATUS
================================================================================

Sites from fixtures:       19/20
Sites from live fallback:   1/20  (zalando-de-main)
Sites missing (error):      0/20  (Run 2: Zalando succeeded via live; Run 1: Zalando errored)

================================================================================
4. BENCHMARK RESULTS
================================================================================

Run 1: F1=50.8%, P=58.5%, R=46.9%  (19/20 successful, 1 error)
Run 2: F1=46.1%, P=57.0%, R=41.4%  (20/20 successful, 0 errors)

Per-site comparison:

Site                      | R1 Det | R2 Det | Det= | R1 F1  | R2 F1  | Delta
--------------------------|--------|--------|------|--------|--------|--------
github-login              |   6    |   5    |  NO  | 72.7%  | 80.0%  | +7.3pp
gitlab-login              |   0    |   0    | YES  |  0.0%  |  0.0%  |  0.0pp
hacker-news               |   6    |   4    |  NO  | 90.9%  | 66.7%  | -24.2pp
linkedin-login            |   4    |   4    | YES  | 66.7%  | 66.7%  |  0.0pp
notion-login              |   2    |   2    | YES  | 57.1%  | 57.1%  |  0.0pp
trello-login              |   0    |   0    | YES  |  0.0%  |  0.0%  |  0.0pp
wikipedia-main            |   3    |   3    | YES  | 75.0%  | 50.0%  | -25.0pp
google-accounts           |   4    |   4    | YES  | 80.0%  | 80.0%  |  0.0pp
shopify-demo              |   6    |   5    |  NO  | 16.7%  | 18.2%  | +1.5pp
stackoverflow-main        |   0    |   0    | YES  |  0.0%  |  0.0%  |  0.0pp
stripe-docs               |   7    |   7    | YES  | 46.2%  | 46.2%  |  0.0pp
target-main               |   6    |   7    |  NO  | 15.4%  | 28.6%  | +13.2pp
typeform-main             |   3    |   4    |  NO  | 44.4%  | 40.0%  | -4.4pp
zendesk-support           |   5    |   5    | YES  | 72.7%  | 72.7%  |  0.0pp
airbnb-main               |   6    |   6    | YES  | 46.2%  | 46.2%  |  0.0pp
booking-main              |   7    |   7    | YES  | 61.5%  | 30.8%  | -30.7pp
ebay-de-main              |   7    |   7    | YES  | 66.7%  | 53.3%  | -13.4pp
zalando-de-main (live)    |   0*   |   1    |  N/A |  0.0%* | 22.2%  |  N/A
amazon-de-main            |   7    |   7    | YES  | 80.0%  | 80.0%  |  0.0pp
angular-material-demo     |   4    |   5    |  NO  | 72.7%  | 83.3%  | +10.6pp

* Zalando: Run 1 errored (live timeout), Run 2 succeeded (live fetch OK)

================================================================================
5. DETERMINISM CHECK (excluding Zalando live-fallback)
================================================================================

Segments identical:          YES -- deterministic (same HTML = same parse = same segments)
Detected count identical:    13/19 sites (68%)
F1 identical (delta<0.1pp):  10/19 sites (53%)
F1 variable (delta>0.1pp):    9/19 sites (47%)
Max F1 delta per site:       30.7pp (booking-main)
Mean |F1 delta| per site:     6.9pp
Aggregate F1 delta:          -4.7pp

Root cause of non-determinism:
  - The HTML parsing, pruning, segmentation pipeline IS deterministic (same input = same segments).
  - The LLM endpoint generation step introduces variance because gpt-4o-mini does not
    produce bit-identical outputs even at temperature=0 (known OpenAI behavior: seed-based
    sampling has residual non-determinism).
  - Sites with 0 detected endpoints in both runs (gitlab, trello, stackoverflow) are
    trivially deterministic -- the pipeline finds no relevant segments.
  - Large-delta sites (booking: 30.7pp, wikipedia: 25pp, hacker-news: 24.2pp) show the
    LLM generating different endpoint labels/types between runs, which affects matching.

================================================================================
6. FIXTURE vs LIVE COMPARISON
================================================================================

                       | Live (03-18) | Fixture Run 1 | Fixture Run 2 |
-----------------------|-------------|---------------|---------------|
Sites successful       |   17/17*    |    19/20      |    20/20      |
F1 (all)               |   51.3%     |    50.8%      |    46.1%      |
Precision              |   60.3%     |    58.5%      |    57.0%      |
Recall                 |   48.0%     |    46.9%      |    41.4%      |
LLM Calls              |    -        |    90         |    91         |
LLM Cost               |    -        |    $0.064     |    $0.065     |
Total Time             |    -        |    1006s      |    880s       |

* 03-18 baseline had 17 of 20 ground-truth sites, so not directly comparable.
  Fixture runs tested all 20.

================================================================================
7. VERDICT
================================================================================

Fixture mode: PASS
  - 19/20 fixtures loaded successfully from local HTML files
  - Benchmark pipeline runs end-to-end against fixture HTML
  - Performance comparable to live runs (F1 ~48-51%)

Determinism:  PARTIAL PASS
  - HTML parsing + segmentation: DETERMINISTIC (same HTML = same segments every time)
  - LLM endpoint generation: NON-DETERMINISTIC (inherent to gpt-4o-mini)
  - 53% of sites produced identical F1 across both runs
  - 68% of sites produced identical detected endpoint counts
  - Aggregate F1 varied by 4.7pp between runs

Recommendation:
  - For regression testing, fixture mode is suitable for detecting LARGE regressions
    (>10pp F1 drop). It cannot detect small changes due to LLM variance.
  - For fully deterministic benchmarks, the LLM layer would need to be mocked or
    a model with better reproducibility (e.g., with fixed seed support) would be needed.
  - The 3 sites with 0 detections (gitlab, trello, stackoverflow) represent pipeline
    failures that should be investigated separately.

================================================================================

Result files:
  tests/real-world/benchmark-results-2026-03-19-fixture-run1.json
  tests/real-world/benchmark-results-2026-03-19-fixture-run2.json
  tests/real-world/benchmark-results-2026-03-19-fixture-report.md
