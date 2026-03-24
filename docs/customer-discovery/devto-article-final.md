# We tested browser agents on 20 real websites — here's where they break

Browser agents (browser-use, Stagehand, Skyvern, Playwright-based tools) promise to automate web interactions. Login to a site, search for a product, add to cart — all autonomously.

But how reliable are they actually? We measured it.

## The Setup

We built a benchmark suite that tests whether agents correctly identify interactive elements on real production websites:

- **20 websites**: GitHub, Amazon, Airbnb, Booking.com, eBay, LinkedIn, Stripe, Hacker News, Wikipedia, Google, Zalando, Shopify, Target, and more
- **Ground truth**: Manually annotated endpoints per site — what a human would identify as login forms, search bars, checkout buttons, navigation menus
- **Metrics**: Precision, Recall, and F1 score

We didn't test agent execution (clicking, typing). We tested something more fundamental: **Does the agent understand what's on the page before it acts?**

## The Results

| Category | Failure Rate | What Goes Wrong |
|----------|:---:|---------|
| Login/Auth | ~30% miss rate | Agent can't find SSO buttons, misses "Sign In" links in e-commerce headers |
| Search | ~25% miss rate | Confused by category dropdowns, misses Cmd+K search overlays |
| E-commerce | ~40% miss rate | Cart icons misidentified, "Add to Cart" vs. navigation confusion |
| Cookie consent | ~50% miss rate | Banners ignored or misclassified as forms |
| Navigation | ~20% miss rate | Footer vs. header nav confusion, mega-menus not understood |

**Overall F1 score: 66%** — meaning roughly 1 in 3 interactions would target the wrong element or miss the right one entirely.

## 4 Things That Surprised Us

### 1. Login links on e-commerce sites are invisible to agents

eBay, Amazon, Zalando — the "Sign In" link in the header looks identical to navigation links in the DOM. Without semantic analysis (password fields nearby? auth-related URL?), agents can't distinguish them.

### 2. Search is harder than it looks

Many modern sites use keyboard shortcuts (Cmd+K) or overlay-based search. The search input doesn't exist in the initial DOM — it only appears after a user action. Agents that scan for `<input type="search">` miss these entirely.

### 3. The gap between "easy" and "hard" sites is massive

Same analysis pipeline, wildly different results:

| Site | F1 Score | Difficulty |
|------|:---:|---|
| Google Accounts | 91% | Easy — clean, semantic HTML |
| Zalando | 89% | Medium — but well-structured |
| Hacker News | 80% | Easy — minimal DOM |
| Amazon | 75% | Hard — thousands of DOM elements, dynamic loading |
| Trello | 29% | Hard — multi-step auth, redirects |

### 4. Cookie banners are the silent killer

Almost every European site has a GDPR cookie banner that blocks the page. Agents either ignore it entirely (and fail on the blocked page) or misclassify it as a form. It's the most common failure mode we found.

## What We Built

We built a tool that helps: **[balage-core](https://www.npmjs.com/package/balage-core)** — a semantic page analysis library for browser agents (MIT licensed, [source on GitHub](https://github.com/osaka2077/balage-ainw)).

```bash
npm install balage-core
```

```typescript
import { analyzeFromHTML } from "balage-core";

const result = await analyzeFromHTML(`
  <form action="/login">
    <input type="email" placeholder="Email">
    <input type="password" placeholder="Password">
    <button type="submit">Sign In</button>
  </form>
`);

console.log(result.endpoints);
// [{type: "auth", label: "Login / Sign-In Form", confidence: 0.90,
//   selector: 'form[action="/login"]', affordances: ["fill", "submit", "click"]}]
```

It works with raw HTML — **no browser needed, no API key, ~6ms response time** (heuristic mode, no LLM call).

What it does:
- Detects login forms, search bars, checkout flows, cookie banners, navigation
- Returns confidence scores (0-1) for every detection
- Generates CSS selectors you can use to target elements
- Detects web frameworks (React, Next.js, WordPress, Shopify, Angular, Vue)
- Optional LLM mode (OpenAI/Anthropic) for higher accuracy

What it doesn't do: It's not a browser agent. It doesn't click or type. It tells your agent **what's on the page** so it can make better decisions.

## The Benchmark Data

Full per-site results from our 20-website benchmark:

| Site | F1 | Notes |
|------|:---:|---|
| Google Accounts | 91% | Auth detected at 100% |
| Zalando | 89% | Cart, Auth, Search all found |
| Typeform | 83% | Clean structure helps |
| Hacker News | 80% | Minimal DOM, easy |
| eBay | 78% | Auth + Cart detected |
| StackOverflow | 77% | Search + Auth found |
| Amazon | 75% | Complex DOM but core endpoints found |
| GitHub | 67% | Login at 93% confidence |
| Booking.com | 63% | Cookie banner still tricky |
| Trello | 29% | Multi-step auth breaks detection |

[Full benchmark data (JSON)](https://github.com/osaka2077/balage-ainw/tree/main/tests/real-world)

## What's Next

We're building an MCP server so Claude, ChatGPT, and Cursor can use this directly. And we're looking for browser-agent developers who want to integrate this into their workflow.

**If you run browser agents in production**, I'd love to hear:
1. What's your biggest reliability challenge?
2. How do you handle sites that change their UI?
3. Would confidence scores before each action help?

Drop a comment or DM me. I'll share the full benchmark dataset (all 20 sites, per-endpoint breakdown) with anyone who's interested.

---

*Built by [Julius](https://github.com/osaka2077) at Sortexai. The benchmark suite and library are [on GitHub](https://github.com/osaka2077/balage-ainw).*

*Tags: #browserautomation #ai #agents #testing #webdev #playwright #opensource*
