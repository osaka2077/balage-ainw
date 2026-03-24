# Core Concepts

This document explains the fundamental concepts behind BALAGE. Understanding these concepts will help you build effective workflows and interpret results.

## Endpoints

An Endpoint is a semantic interaction point on a web page. Unlike raw DOM elements, endpoints carry meaning: "This is a login form", "This is an add-to-cart button", "This is a search input".

BALAGE does not work with CSS selectors or XPaths directly. It identifies *what things are* and *what they do*, making automation resilient to UI changes.

### Endpoint Types

**Phase 1 (MVP)** — formularlastige Flows, aktiv optimiert:

| Type | Description | Examples |
|------|-------------|---------|
| `auth` | Authentication flow | Login, signup, password reset |
| `form` | Data input form | Contact form, survey, registration |
| `checkout` | Purchase/payment flow | Shopping cart, payment form |
| `support` | Help/support interaction | Chat widget, ticket form, FAQ |

**Phase 2+** — erkannt aber nicht aktiv optimiert:

| Type | Description | Examples |
|------|-------------|---------|
| `navigation` | Page navigation element | Menu, breadcrumbs, pagination |
| `search` | Search functionality | Search bar, filters, autocomplete |
| `commerce` | E-commerce interaction | Product listing, wishlist, compare |
| `content` | Content interaction | Article, video player, download |
| `consent` | Permission/consent flow | Cookie banner, GDPR dialog, terms |
| `media` | Media interaction | Image gallery, video controls |
| `social` | Social interaction | Share buttons, comments, likes |
| `settings` | Configuration interface | Account settings, preferences |

Phase 1 fokussiert auf formularlastige Flows. Andere Endpoint-Typen werden erkannt aber nicht aktiv optimiert.

### Endpoint Lifecycle

Every endpoint progresses through a lifecycle:

```
discovered → inferred → verified → deprecated / broken / suspended
```

| Status | Meaning |
|--------|---------|
| `discovered` | Found in the DOM but not yet analyzed |
| `inferred` | Semantically analyzed by the LLM, evidence collected |
| `verified` | Successfully interacted with, confirming its purpose |
| `deprecated` | Previously valid but no longer present on the page |
| `broken` | Present but not functioning as expected |
| `suspended` | Temporarily paused (e.g., by risk gate decision) |

### Endpoint Discovery

BALAGE discovers endpoints through a multi-step process:

1. **DOM Parsing** — Extract the full DOM tree with visibility, interactivity, and bounding boxes
2. **ARIA Extraction** — Build an accessibility tree with roles, names, and states
3. **UI Segmentation** — Group DOM nodes into semantic regions (forms, navigation, content, modals)
4. **LLM Inference** — Use a language model to interpret what each segment *means*
5. **Evidence Collection** — Gather signals from multiple sources to support the interpretation
6. **Confidence Scoring** — Calculate a calibrated confidence score for each endpoint

This approach detects endpoints that screenshot-based systems miss: hidden form fields, dynamically loaded content, ARIA-labeled elements, and semantically complex interactions.

---

## Semantic Fingerprints

A Semantic Fingerprint is a stable hash of an endpoint's semantic features. Even when the DOM changes (new CSS classes, restructured HTML, different layout), the fingerprint remains stable if the semantic purpose hasn't changed.

### How Fingerprints Work

Fingerprints are computed from a feature vector that captures the *meaning* of an endpoint:

| Feature Category | What It Captures |
|-----------------|------------------|
| **Semantic Role** | What the endpoint does (e.g., "login form", "search bar") |
| **Intent Signals** | Keywords and patterns indicating purpose |
| **Form Fields** | Type, purpose, and position of input fields |
| **Action Elements** | Buttons and their labels (submit, cancel, navigate) |
| **DOM Depth** | Structural nesting level |
| **Interactive Elements** | Count of clickable/fillable elements |
| **Heading Hierarchy** | Section headings that provide context |
| **Layout Region** | Where on the page (header, main, sidebar, footer, modal) |
| **Approximate Position** | Relative position as percentage (top, left) |
| **Visible Text** | Hash of visible text content |
| **Label/Button Texts** | Human-readable labels and button texts |

The feature vector is hashed into a stable identifier. Two endpoints on different versions of a page will have the same fingerprint if they serve the same purpose, even if the underlying HTML is completely different.

### Drift Detection

When BALAGE revisits a page, it compares the current endpoint's fingerprint features against the stored fingerprint. The similarity score determines the action:

| Similarity | Action | Meaning |
|-----------|--------|---------|
| > 0.95 | `IGNORE` | Trivial change (e.g., updated timestamp), no action needed |
| > 0.85 | `LOG` | Minor change detected, log for review but continue using |
| > 0.70 | `RE_EVALUATE` | Significant change, re-run semantic analysis |
| < 0.50 | `INVALIDATE` | Endpoint has fundamentally changed, discard and re-discover |

---

## Confidence Scores

Every endpoint has a confidence score between 0 and 1 that represents how certain BALAGE is about its semantic interpretation. The score is calibrated — a confidence of 0.85 means the interpretation is correct approximately 85% of the time.

### The Confidence Formula

```
score = w1 * semanticMatch
      + w2 * structuralStability
      + w3 * affordanceConsistency
      + w4 * evidenceQuality
      + w5 * historicalSuccess
      - w6 * ambiguityPenalty
```

### Weights

| Weight | Name | Default | What It Measures |
|--------|------|---------|-----------------|
| `w1` | Semantic Match | 0.25 | How well does the LLM's interpretation match the evidence? |
| `w2` | Structural Stability | 0.20 | Is the DOM structure consistent with the claimed type? |
| `w3` | Affordance Consistency | 0.20 | Do the available actions match what this endpoint type should offer? |
| `w4` | Evidence Quality | 0.15 | How strong and diverse is the supporting evidence? |
| `w5` | Historical Success | 0.10 | Has this endpoint been successfully used before? |
| `w6` | Ambiguity Penalty | 0.10 | Are there conflicting signals? (subtracted) |

### Evidence

Each evidence item has a type, a signal description, and a weight:

| Evidence Type | Source | Description |
|--------------|--------|-------------|
| `semantic_label` | DOM | Text labels, headings, placeholder text |
| `aria_role` | ARIA | ARIA roles and labels (e.g., `role="form"`) |
| `structural_pattern` | DOM | DOM structure patterns (e.g., `input[type=password]`) |
| `text_content` | DOM | Visible text content and keywords |
| `layout_position` | DOM | Position on the page (header, sidebar, main) |
| `historical_match` | History | Match with previously verified endpoints |
| `fingerprint_similarity` | Fingerprint | Similarity to known fingerprints |
| `llm_inference` | LLM | Language model's semantic interpretation |
| `user_confirmation` | Operator | Human confirmation of the interpretation |
| `verification_proof` | Verification | Successful interaction confirming the purpose |

Evidence from multiple independent sources produces higher confidence than evidence from a single source. The `evidenceQuality` component rewards diversity.

### Calibration

Raw confidence scores are calibrated using **Platt Scaling** — a logistic regression that maps raw scores to true probabilities. BALAGE targets a **Brier Score below 0.1**, meaning the calibrated scores are well-aligned with actual accuracy.

A **Reliability Diagram** plots predicted confidence against observed accuracy. A perfectly calibrated system falls on the diagonal line (predicted 0.8 = correct 80% of the time).

---

## Risk Gates

Risk Gates are the safety layer. Every action passes through a risk gate that decides: **ALLOW**, **DENY**, or **ESCALATE**. The default is **DENY**.

### Action Classes

Actions are classified by their potential impact. Higher-risk actions require higher confidence:

| Action Class | Confidence Threshold | Max Contradiction | Examples |
|-------------|---------------------|-------------------|----------|
| `read_only` | 0.60 | 0.40 | Read text, take screenshot |
| `reversible_action` | 0.75 | 0.30 | Click a link, open a dropdown |
| `form_fill` | 0.80 | 0.25 | Fill an input field |
| `submit_data` | 0.85 | 0.20 | Submit a form |
| `financial_action` | 0.92 | 0.10 | Confirm a payment |
| `destructive_action` | 0.95 | 0.05 | Delete an account, cancel a subscription |

### Decision Logic

The risk gate evaluates three conditions in order:

1. **Confidence check:** Is `confidence >= threshold` for the action's class?
2. **Contradiction check:** Is `contradictionScore <= maxContradiction` for the class?
3. **Evidence check:** Are there enough evidence items to support the decision?

```
IF all checks pass     → ALLOW
IF confidence too low  → DENY
IF contradictions high → DENY
IF evidence missing    → ESCALATE
```

The gate decision, along with all inputs and reasoning, is recorded in the [Audit Trail](#audit-trail).

### Contradiction Detection

Contradictions occur when different evidence sources disagree about an endpoint's purpose. For example:

- The ARIA role says `role="navigation"` but the LLM infers it's a form
- The text content says "Delete Account" but the structural pattern looks like a login form
- Historical data shows this endpoint was a search bar, but it now has password fields

High contradiction scores reduce confidence and can cause the risk gate to deny an action even if the raw confidence is above the threshold.

---

## Audit Trail

Every decision BALAGE makes is recorded in an immutable audit trail. This provides full transparency and allows replay of any workflow.

### What Gets Recorded

Each audit entry captures:

| Field | Description |
|-------|-------------|
| `id` | Unique entry ID |
| `traceId` | Links all entries of a single workflow execution |
| `timestamp` | When the decision was made |
| `actor` | Who made the decision: `system`, `sub_agent`, or `human` |
| `actorId` | Identifier of the specific actor |
| `action` | What action was attempted |
| `endpoint_id` | Which endpoint was involved |
| `decision` | Gate result: `allowed`, `denied`, `escalated` |
| `confidence` | Confidence score at the time of decision |
| `riskGateResult` | Risk gate outcome |
| `evidence_chain` | Full evidence chain supporting the decision |
| `input` | Input data for the action |
| `output` | Result data from the action |
| `duration` | How long the action took (ms) |
| `success` | Whether the action succeeded |
| `errorCode` | Error code if the action failed |

### Trace Correlation

The `traceId` field connects all audit entries from a single workflow execution. The full chain can be retrieved programmatically:

```typescript
const chain = await client.evidence.getChain(traceId);

for (const entry of chain.chain) {
  console.log(`${entry.action}: ${entry.outcome} (confidence: ${entry.confidenceScore})`);
}
```

This is essential for debugging: when a workflow fails or produces unexpected results, the evidence chain shows exactly what BALAGE saw, what it decided, and why.

---

## Sub-Agents

BALAGE uses specialized sub-agents for different tasks. Each agent has limited capabilities following the principle of **least privilege** — an agent that fills forms cannot make payments.

| Agent | Responsibility | Capabilities |
|-------|---------------|-------------|
| **Navigator** | Page navigation, link clicking | `canNavigate`, `canClick` |
| **FormFiller** | Form completion | `canFill`, `canClick` |
| **Verifier** | Result verification | `canReadSensitive` |
| **ActionExecutor** | Button clicks, submissions | `canClick`, `canSubmit` |
| **Authenticator** | Login flows | `canFill`, `canSubmit` |
| **DataExtractor** | Data scraping | `canReadSensitive` |
| **ErrorHandler** | Recovery from errors | `canNavigate`, `canClick` |
| **ConsentManager** | Cookie/GDPR consent | `canClick` |

### Capability Matrix

| Capability | Navigator | FormFiller | Verifier | ActionExecutor | Authenticator | DataExtractor | ErrorHandler | ConsentManager |
|-----------|-----------|------------|----------|----------------|---------------|---------------|--------------|----------------|
| `canNavigate` | Yes | No | No | No | No | No | Yes | No |
| `canFill` | No | Yes | No | No | Yes | No | No | No |
| `canSubmit` | No | No | No | Yes | Yes | No | No | No |
| `canClick` | Yes | Yes | No | Yes | No | No | Yes | Yes |
| `canReadSensitive` | No | No | Yes | No | No | Yes | No | No |
| `canMakePayment` | No | No | No | No | No | No | No | No |

### Action Budgets

Each sub-agent operates within strict resource limits:

| Limit | Default | Description |
|-------|---------|-------------|
| `action_budget` | 50 | Maximum number of browser actions the agent can take |
| `timeout` | 30,000 ms | Maximum execution time |
| `maxRetries` | 3 | Maximum retry attempts on failure |
| `maxBudget` | $0.10 | Maximum LLM cost per agent execution |

These limits prevent runaway agents from consuming excessive resources or performing unintended actions. If an agent exceeds its budget, it is terminated and the orchestrator handles the failure according to the workflow's error strategy.

### Isolation

Sub-agents can run in two isolation modes:

| Mode | Description |
|------|-------------|
| `shared_session` | Agent shares the browser session with other agents (default) |
| `own_context` | Agent gets its own browser context, isolated from others |

Use `own_context` for sensitive operations (e.g., authentication) where session state should not leak to other agents.
