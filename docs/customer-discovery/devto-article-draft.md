# Dev.to Article Draft: Browser Agent Benchmark

> Titel-Optionen:
> 1. "We tested browser agents on 20 real websites — here's where they break"
> 2. "Browser agents fail 35% of the time. We measured it."
> 3. "The trust gap in browser automation: benchmarking 20 real websites"

---

## Draft

**We tested browser agents against 20 real production websites. The results were sobering.**

Browser agents (browser-use, Stagehand, Skyvern, Playwright-based tools) promise to automate web interactions. But how reliable are they actually?

We built a benchmark that measures how well agents understand web pages — not just whether they can click buttons, but whether they identify the *right* buttons. Login forms, search bars, checkout flows, navigation menus.

### The Setup

- **20 real websites**: GitHub, Amazon, Airbnb, Booking.com, eBay, LinkedIn, Stripe, Hacker News, Wikipedia, and 11 more
- **Ground truth**: manually annotated endpoints per site (what a human would identify)
- **Metrics**: Precision (how many detected endpoints are correct), Recall (how many real endpoints were found), F1 score

### Key Findings

| Category | Failure Rate | Example |
|----------|:---:|---------|
| Login/Auth flows | ~30% miss rate | Agent can't find SSO buttons, misses "Sign In" links in headers |
| Search bars | ~25% miss rate | Confused by category dropdowns, keyboard-shortcut search (Cmd+K) |
| E-commerce (cart, checkout) | ~40% miss rate | Cart icons misidentified, checkout vs. navigation confusion |
| Navigation | ~20% miss rate | Footer vs. header nav confusion, mega-menus not understood |

**Overall F1 score: 65.7%** — meaning roughly 1 in 3 interactions would target the wrong element or miss the right one entirely.

### What Surprised Us

1. **Login links on e-commerce sites are invisible to agents.** eBay, Amazon, Zalando — the "Sign In" link in the header is semantically indistinguishable from other navigation links without deeper analysis.

2. **Search is harder than it looks.** Many modern sites use keyboard shortcuts (Cmd+K) or overlay-based search that doesn't exist in the initial DOM. Agents that rely on `<input type="search">` miss these entirely.

3. **The gap between "easy" and "hard" sites is massive.** Hacker News: 80% F1. Amazon: 59% F1. The same agent pipeline performs wildly differently based on site complexity.

4. **LLM-based classification helps but hallucinates.** Using gpt-4o-mini to classify UI elements works well for obvious cases but generates false positives for ~30% of complex pages.

### What We're Building

We're working on a **semantic verification layer** — a trust layer that sits between the browser agent and the web. It tells your agent:
- What interactive elements are on the page
- What type they are (login, search, checkout, navigation)
- How confident it is (calibrated score, not just "yes/no")
- Evidence chain for every classification

It's complementary to browser-use, Stagehand, Skyvern — not a replacement.

### Want to Help?

If you run browser agents in production and have 15 minutes, I'd love to hear about your reliability challenges. I'll share our full benchmark data (all 20 sites, per-site breakdown) in return.

DM me or comment below.

---

*Tags: #browserautomation #ai #agents #testing #webdev*
