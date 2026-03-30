/**
 * System-Prompts und Few-Shot-Templates fuer LLM-basierte Endpoint-Extraktion
 */

import type { PrunedSegment, GenerationContext, PageSegmentSummary } from "./types.js";

// ============================================================================
// System Prompt
// ============================================================================

export const ENDPOINT_EXTRACTION_SYSTEM_PROMPT = `You are an expert UI analyst. Your task is to identify interactive endpoints in a web page segment.

An "Endpoint" is a semantically meaningful, interactive UI area where a user can perform an action — e.g., a login form, a search bar, a checkout flow, a navigation menu.

RULES:
- Only identify INTERACTIVE elements as endpoints. Pure content/text areas are NOT endpoints.
- Each endpoint must have a type, label, description, confidence score, DOM anchors, and affordances.
- Confidence ranges from 0.0 to 1.0 — use 0.9+ only when extremely certain.
- Return valid JSON matching the expected schema.
- Return at most 6 endpoints per segment. Only the most important, distinct ones.
- Prefer fewer, higher-confidence results. Most segments have 1-2 truly distinct endpoints.
- Only return endpoints that represent DISTINCT, user-facing interaction points. Do NOT return decorative elements, repeated navigation links, generic content sections, or footer links.
- Focus on PRIMARY functionality: main search bar, login/signup forms, checkout/cart, cookie/consent banners, and the single most prominent navigation. Skip secondary nav, social links, and language selectors.
- If unsure whether something is a meaningful endpoint, include it with a LOW confidence score (0.3-0.5) rather than omitting it entirely. The confidence filter will handle borderline cases.
- A page typically has 3-6 truly important endpoints. Prefer fewer, high-quality results over many low-quality ones.
- Do NOT return multiple endpoints of the same type unless they serve clearly different purposes (e.g., a login form and a separate registration form are distinct; two navigation menus are NOT).

IMPORTANT — SEGMENT TYPE vs ENDPOINT TYPE:
- Each segment has a pre-classified type (e.g., "navigation", "form"). This classification is based on DOM structure, NOT content.
- The segment type is a HINT, not a constraint.
- A navigation section that contains search inputs is a SEARCH endpoint, not navigation.
- A form segment is an AUTH endpoint only if it has password/credential fields. A form without password fields is just "form".
- AUTH LINKS IN NAVIGATION — rules:
  - If the segment contains actual credential input fields (password, email): Always classify as "auth".
  - Sign In / Login / Account links in site headers are ALWAYS a separate "auth" endpoint, even as plain text links. Browser agents need to find these to start authentication flows.
  - Registration / Sign Up links next to login are also "auth" endpoints.
  - Cart / Basket / Warenkorb links in headers are ALWAYS a separate "checkout" endpoint. Browser agents need these for purchase flows.
  - These header utility links (auth, cart) are distinct from the site's main navigation menu.

ENDPOINT TYPES:
- auth: Login, register, password reset forms
- form: Generic forms (contact, feedback, newsletter signup)
- checkout: Purchase/payment flows
- commerce: Product pages with add-to-cart, wishlists
- search: Search inputs with submit capability
- navigation: Nav bars, menus, breadcrumbs
- support: Chat widgets, help forms, ticket submission
- content: Interactive content (accordions, tabs, carousels)
- consent: Cookie banners, GDPR consent, terms acceptance
- media: Video/audio players with controls
- social: Social sharing, like/follow buttons
- settings: User preferences, account settings

AFFORDANCE TYPES:
- click: Button or clickable element
- fill: Text input field
- select: Dropdown or multi-select
- toggle: Checkbox, radio, switch
- submit: Form submission
- navigate: Link navigation
- upload: File upload
- scroll: Scrollable container
- drag: Drag-and-drop target
- read: Read-only interactive (expandable content)

OUTPUT FORMAT:
Return a JSON object with:
{
  "endpoints": [...],
  "reasoning": "Brief explanation of analysis"
}

Each endpoint object:
{
  "type": "<endpoint_type>",
  "label": "<human-readable label>",
  "description": "<what this endpoint does>",
  "confidence": <0.0-1.0>,
  "anchors": [{ "selector": "...", "ariaRole": "...", "ariaLabel": "...", "textContent": "..." }],
  "affordances": [{ "type": "...", "expectedOutcome": "...", "reversible": true/false }],
  "reasoning": "<why this is this type>"
}

CONFIDENCE CALIBRATION — USE THE FULL RANGE:
- 0.90-1.0: Primary interactive elements with clear purpose (login form with fields, main search bar, cart button)
- 0.75-0.89: Clear endpoints but secondary (SSO options group, newsletter signup, sidebar navigation)
- 0.60-0.74: Likely endpoints with some ambiguity (footer nav, help link in header, language selector)
- 0.45-0.59: Borderline — could be endpoint or decorative (social links, breadcrumbs, generic content tabs)
- Below 0.45: Probably not a meaningful endpoint — omit

IMPORTANT: Spread your confidence scores across the full range. Do NOT cluster everything at 0.85-0.90. A login form (0.95) should be clearly distinguished from a footer link (0.55).

COMMON MISCLASSIFICATIONS — AVOID THESE:
- A form with date-pickers (check-in/check-out) and a "Search"/"Find" button on travel/booking sites is SEARCH, not CHECKOUT. Checkout requires cart, payment, or pricing elements.
- Cookie/consent dialogs with "Accept All"/"Reject All" are CONSENT, even if they have "Settings" or "Manage Preferences" links. The primary purpose is consent collection, not settings.
- "Submit a Request", "Contact Support", "Help Center", "Get Help" are SUPPORT endpoints, even when they appear as plain links in navigation. They trigger help/ticket flows.
- "Settings" is only for user preference UIs with toggles/switches/sliders. Language selectors alone are NAVIGATION. Cookie settings within consent banners are CONSENT.
- Category navigation on e-commerce sites (Mega-Menu, Department links) is NAVIGATION, not CHECKOUT or COMMERCE — even if it leads to product pages.`;

// ============================================================================
// Few-Shot Examples
// ============================================================================

export const ENDPOINT_EXTRACTION_FEW_SHOT = [
  {
    input: `SEGMENT [form] confidence=0.9
  FORM
    HEADING(2): "Sign In"
    LABEL: "Email"
      INPUT[type=email, required, aria-label="Email address"]
    LABEL: "Password"
      INPUT[type=password, required, aria-label="Password"]
    LINK: "Forgot password?"
    BUTTON[type=submit]: "Sign In"
    TEXT: "Don't have an account?"
    LINK: "Create account"`,
    output: {
      endpoints: [
        {
          type: "auth",
          label: "Sign In Form",
          description:
            "Authentication form with email and password fields, plus links to password recovery and registration.",
          confidence: 0.95,
          anchors: [
            {
              selector: "form",
              ariaRole: "form",
              textContent: "Sign In",
            },
          ],
          affordances: [
            { type: "fill", expectedOutcome: "Enter email address", reversible: true },
            { type: "fill", expectedOutcome: "Enter password", reversible: true },
            { type: "submit", expectedOutcome: "Authenticate user", reversible: false },
            { type: "navigate", expectedOutcome: "Go to password recovery", reversible: true },
          ],
          reasoning:
            "Form with email + password inputs and a submit button labeled 'Sign In' is a classic authentication endpoint.",
        },
      ],
      reasoning:
        "Single form segment with clear authentication pattern: email + password fields with sign-in submit.",
    },
  },
  {
    input: `SEGMENT [navigation] confidence=0.85
  NAV[aria-label="Main navigation"]
    UL
      LI > LINK: "Home"
      LI > LINK: "Products"
      LI > LINK: "Pricing"
      LI > LINK: "About"
      LI > LINK: "Contact"
    BUTTON[aria-label="Open mobile menu"]: "☰"`,
    output: {
      endpoints: [
        {
          type: "navigation",
          label: "Main Navigation",
          description:
            "Primary site navigation with links to main sections and a mobile menu toggle.",
          confidence: 0.9,
          anchors: [
            {
              selector: "nav",
              ariaRole: "navigation",
              ariaLabel: "Main navigation",
            },
          ],
          affordances: [
            { type: "navigate", expectedOutcome: "Navigate to site section", reversible: true },
            { type: "click", expectedOutcome: "Toggle mobile menu", reversible: true },
          ],
          reasoning:
            "NAV element with aria-label 'Main navigation' containing a list of links — standard navigation pattern.",
        },
      ],
      reasoning:
        "NAV landmark with structured link list is a primary navigation endpoint.",
    },
  },
  {
    input: `SEGMENT [form] confidence=0.8
  DIV[role=search]
    FORM
      INPUT[type=search, placeholder="Search products...", aria-label="Search"]
      BUTTON[type=submit, aria-label="Search"]: "🔍"
    DIV[aria-live=polite]: "Type to search..."`,
    output: {
      endpoints: [
        {
          type: "search",
          label: "Product Search",
          description:
            "Search input for finding products with auto-suggest and submit button.",
          confidence: 0.85,
          anchors: [
            {
              selector: "div[role=search]",
              ariaRole: "search",
              ariaLabel: "Search",
            },
          ],
          affordances: [
            { type: "fill", expectedOutcome: "Enter search query", reversible: true },
            { type: "submit", expectedOutcome: "Execute product search", reversible: true },
          ],
          reasoning:
            "DIV with role=search containing a search input and submit button — clear search endpoint.",
        },
      ],
      reasoning:
        "Search landmark with input[type=search] and submit button is a search endpoint.",
    },
  },
  {
    input: `SEGMENT [navigation] confidence=0.85
  NAV[aria-label="User navigation"]
    UL
      LI > LINK: "Login"
      LI > LINK: "Sign Up"
      LI > LINK: "Cart (0)"
      LI > LINK: "Help"`,
    output: {
      endpoints: [
        {
          type: "navigation",
          label: "User Navigation",
          description:
            "Small navigation section with 4 links including auth, cart, and help. With only 4 links and mixed purposes, this is primarily a navigation endpoint.",
          confidence: 0.8,
          anchors: [
            {
              selector: "nav",
              ariaRole: "navigation",
              ariaLabel: "User navigation",
            },
          ],
          affordances: [
            { type: "navigate", expectedOutcome: "Navigate to auth/cart/help pages", reversible: true },
          ],
          reasoning:
            "4 links with mixed purposes (auth + commerce + support). Not enough links for dual-endpoint pattern (5+), and auth links are not the majority (2 of 4). Stays as navigation.",
        },
      ],
      reasoning:
        "Small navigation with mixed-purpose links. Auth links are present but not dominant — single navigation endpoint.",
    },
  },
  {
    input: `SEGMENT [navigation] confidence=0.9
  HEADER
    NAV[aria-label="Main"]
      UL
        LI > LINK: "Products"
        LI > LINK: "Solutions"
        LI > LINK: "Pricing"
        LI > LINK: "Resources"
        LI > LINK: "Blog"
      DIV[class="nav-actions"]
        LINK: "Login"
        BUTTON: "Get Started"`,
    output: {
      endpoints: [
        {
          type: "navigation",
          label: "Main Navigation",
          description:
            "Primary site navigation with links to Products, Solutions, Pricing, Resources, and Blog.",
          confidence: 0.85,
          anchors: [
            {
              selector: "nav",
              ariaRole: "navigation",
              ariaLabel: "Main",
            },
          ],
          affordances: [
            { type: "navigate", expectedOutcome: "Navigate to site section", reversible: true },
          ],
          reasoning:
            "NAV element with 5+ links covering main site sections — primary navigation endpoint.",
        },
        {
          type: "auth",
          label: "Login / Get Started",
          description:
            "Auth entry points with a Login link and prominent 'Get Started' CTA button in the header.",
          confidence: 0.65,
          anchors: [
            { selector: "div.nav-actions", textContent: "Login" },
            { selector: "button", textContent: "Get Started" },
          ],
          affordances: [
            { type: "navigate", expectedOutcome: "Navigate to login page", reversible: true },
            { type: "click", expectedOutcome: "Start registration/onboarding", reversible: true },
          ],
          reasoning:
            "Navigation has 5+ links, so primary endpoint is navigation. But 'Get Started' is a prominent BUTTON (not a plain link) — standalone auth CTA buttons warrant a separate auth endpoint.",
        },
      ],
      reasoning:
        "Header nav with section links → navigation. 'Get Started' BUTTON is a prominent CTA → separate auth endpoint. (A plain Login link alone would stay as part of navigation.)",
    },
  },
  // Example 6: Travel/Booking Search (NOT checkout)
  {
    input: `SEGMENT [form] confidence=0.9
  FORM
    LABEL: "Destination"
      INPUT[type=text, placeholder="Where are you going?"]
    LABEL: "Check-in"
      INPUT[type=date, aria-label="Check-in date"]
    LABEL: "Check-out"
      INPUT[type=date, aria-label="Check-out date"]
    LABEL: "Guests"
      SELECT: "1 Adult"
    BUTTON[type=submit]: "Search"`,
    output: {
      endpoints: [{
        type: "search",
        label: "Accommodation Search",
        description: "Travel search form with destination, date pickers, and guest selection.",
        confidence: 0.9,
        anchors: [{ selector: "form", textContent: "Search" }],
        affordances: [
          { type: "fill", expectedOutcome: "Enter destination", reversible: true },
          { type: "select", expectedOutcome: "Select dates and guests", reversible: true },
          { type: "submit", expectedOutcome: "Search for accommodations", reversible: true },
        ],
        reasoning: "Form with destination input, date pickers, and 'Search' button. This is SEARCH, NOT checkout — no cart, payment, or pricing. Date pickers for travel are search parameters.",
      }],
      reasoning: "Travel search form. Key: 'Search' button + date pickers = search. Checkout requires cart/payment.",
    },
  },
  // Example 7: Cookie Consent Banner (NOT settings)
  {
    input: `SEGMENT [footer] confidence=0.8
  DIV[role=dialog, aria-label="Cookie consent"]
    TEXT: "We use cookies to improve your experience."
    BUTTON: "Accept All"
    BUTTON: "Reject All"
    LINK: "Cookie Settings"`,
    output: {
      endpoints: [{
        type: "consent",
        label: "Cookie Consent Banner",
        description: "GDPR cookie consent dialog with accept/reject options.",
        confidence: 0.9,
        anchors: [{ selector: "div[role=dialog]", ariaLabel: "Cookie consent" }],
        affordances: [
          { type: "click", expectedOutcome: "Accept or reject cookies", reversible: false },
        ],
        reasoning: "Dialog about cookies with Accept/Reject buttons. Even though 'Cookie Settings' link exists, this is CONSENT (permission), not SETTINGS (preferences).",
      }],
      reasoning: "Cookie consent dialog. 'Settings' links within consent do NOT make it a settings endpoint.",
    },
  },
  // Example 8: Support Endpoint (NOT navigation)
  {
    input: `SEGMENT [navigation] confidence=0.85
  NAV
    UL
      LI > LINK: "Products"
      LI > LINK: "Documentation"
    DIV
      LINK: "Submit a Request"
      LINK: "Contact Support"`,
    output: {
      endpoints: [
        {
          type: "navigation",
          label: "Main Navigation",
          description: "Site navigation with section links.",
          confidence: 0.85,
          anchors: [{ selector: "nav", ariaRole: "navigation" }],
          affordances: [{ type: "navigate", expectedOutcome: "Navigate to section", reversible: true }],
          reasoning: "NAV with section links — standard navigation.",
        },
        {
          type: "support",
          label: "Support Links",
          description: "Links to submit support requests and contact support team.",
          confidence: 0.7,
          anchors: [{ textContent: "Submit a Request" }, { textContent: "Contact Support" }],
          affordances: [{ type: "click", expectedOutcome: "Open support flow", reversible: true }],
          reasoning: "'Submit a Request' and 'Contact Support' are SUPPORT, not navigation. They trigger help/ticket flows.",
        },
      ],
      reasoning: "Header with navigation + support links. Support actions are distinct from navigation.",
    },
  },
  // Example 9: Decorative/content-only section — ZERO endpoints
  {
    input: `SEGMENT [content] confidence=0.6
  DIV[class="hero-banner"]
    HEADING(1): "Welcome to our site"
    TEXT: "We make great things happen. Trusted by thousands of customers worldwide."
    IMG[src="hero.jpg", alt="Hero banner"]`,
    output: {
      endpoints: [],
      reasoning: "No interactive elements. Decorative content only — no forms, buttons, links, or inputs. Not every segment contains endpoints.",
    },
  },
  // Example 10: SSO Login Page — multiple SSO buttons = 1 endpoint
  {
    input: `SEGMENT [form] confidence=0.9
  FORM
    HEADING(2): "Log in to your account"
    LABEL: "Email"
      INPUT[type=email, required]
    BUTTON[type=submit]: "Continue with email"
    DIV[class="sso-divider"]
      TEXT: "or continue with"
    BUTTON: "Continue with Google"
    BUTTON: "Continue with Microsoft"
    BUTTON: "Continue with Apple"
    LINK: "Forgot password?"
    LINK: "Create account"`,
    output: {
      endpoints: [
        {
          type: "auth",
          label: "Login Form",
          description: "Email login form with Continue button and password recovery link.",
          confidence: 0.95,
          anchors: [{ selector: "form", textContent: "Log in to your account" }],
          affordances: [
            { type: "fill", expectedOutcome: "Enter email address", reversible: true },
            { type: "submit", expectedOutcome: "Continue login flow", reversible: false },
          ],
          reasoning: "Email input + submit button = primary auth form.",
        },
        {
          type: "auth",
          label: "SSO Options",
          description: "Google, Microsoft, and Apple single sign-on buttons grouped as one endpoint.",
          confidence: 0.85,
          anchors: [
            { selector: "button", textContent: "Continue with Google" },
            { selector: "button", textContent: "Continue with Microsoft" },
          ],
          affordances: [
            { type: "click", expectedOutcome: "Start OAuth flow with selected provider", reversible: true },
          ],
          reasoning: "3 SSO buttons = 1 auth endpoint (SSO Options), NOT 3 separate endpoints. They all serve the same purpose: third-party authentication.",
        },
      ],
      reasoning: "Login page with email form + 3 SSO buttons. SSO buttons are grouped as ONE endpoint because they serve the same purpose (third-party auth). Forgot password and Create account links are secondary nav, not separate endpoints.",
    },
  },
];

// ============================================================================
// System-Prompt mit Few-Shot (fuer OpenAI Prompt-Caching, ~32% Input-Kosten-Reduktion)
// ============================================================================

function buildFewShotSection(): string {
  const parts: string[] = [];
  parts.push("\n\n## FEW-SHOT EXAMPLES\n");
  for (const example of ENDPOINT_EXTRACTION_FEW_SHOT) {
    parts.push("### Example Input:");
    parts.push("```");
    parts.push(example.input);
    parts.push("```");
    parts.push("### Example Output:");
    parts.push("```json");
    parts.push(JSON.stringify(example.output, null, 2));
    parts.push("```");
    parts.push("");
  }
  return parts.join("\n");
}

/** System-Prompt inklusive Few-Shot-Examples — cached von OpenAI bei wiederholten Calls */
export const ENDPOINT_EXTRACTION_SYSTEM_PROMPT_WITH_EXAMPLES =
  ENDPOINT_EXTRACTION_SYSTEM_PROMPT + buildFewShotSection();

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Baut den User-Prompt fuer die LLM-basierte Endpoint-Extraktion zusammen.
 */
export function buildExtractionPrompt(
  prunedSegment: PrunedSegment,
  context: GenerationContext,
  allSegments?: PageSegmentSummary[],
): string {
  const parts: string[] = [];

  parts.push("## Page Context");
  parts.push(`URL: ${context.url}`);
  if (context.pageTitle) {
    parts.push(`Title: ${context.pageTitle}`);
  }
  if (context.pageType && context.pageType !== "generic") {
    parts.push(`Page Type: ${context.pageType}`);
  }
  parts.push("");

  // Markdown-Context (FC-018): Wenn verfuegbar, als zusaetzlichen Kontext anhaengen
  if (context.markdownSummary) {
    parts.push("## Page Summary (from Markdown)");
    parts.push("Use this summary as additional context to better understand the page's purpose and content.");
    parts.push("Do NOT extract endpoints from this summary — only from the UI segment below.");
    parts.push("");
    parts.push(context.markdownSummary);
    parts.push("");
  }

  // Page Overview: alle Segmente als Kontext, damit das LLM die Seite versteht
  if (allSegments && allSegments.length > 1) {
    parts.push("## Page Overview (context — do NOT analyze these, just use as context)");
    parts.push(`This page has ${allSegments.length} UI segments:`);
    for (const seg of allSegments) {
      const labelPart = seg.label ? ` (${seg.label})` : "";
      parts.push(`- [${seg.type}] interactiveElements: ${seg.interactiveElements}${labelPart}`);
    }
    parts.push("");
  }

  parts.push("## UI Segment to Analyze");
  parts.push(`Segment ID: ${prunedSegment.segmentId}`);
  parts.push(`Segment Type (DOM-based): ${prunedSegment.segmentType ?? "unknown"}`);
  parts.push(`Estimated Tokens: ${prunedSegment.estimatedTokens}`);
  parts.push(`Preserved Elements: ${prunedSegment.preservedElements}`);
  parts.push("");
  parts.push("```");
  parts.push(prunedSegment.textRepresentation);
  parts.push("```");
  parts.push("");

  // Segment-Budget: give the LLM context about page size to prevent over-generation
  if (allSegments && allSegments.length > 0) {
    const currentIndex = allSegments.findIndex(
      (s) => s.type === prunedSegment.segmentType && s.label === prunedSegment.segmentId,
    );
    // Fallback: derive index from segment ID position or use 0
    const displayIndex = currentIndex >= 0 ? currentIndex + 1 : undefined;
    parts.push("## Endpoint Budget");
    if (displayIndex) {
      parts.push(
        `This page has ${allSegments.length} segments. You are analyzing segment ${displayIndex}/${allSegments.length}.`,
      );
    } else {
      parts.push(
        `This page has ${allSegments.length} segments total.`,
      );
    }
    parts.push(
      "A typical page has 3-6 important endpoints total. Be selective — only return endpoints that represent genuinely distinct interactive features, not decorative or redundant elements.",
    );
    parts.push("");
  }

  parts.push("## Your Task");
  parts.push(
    "Analyze the UI segment above and identify all interactive endpoints. Return valid JSON matching the format shown in the examples.",
  );

  return parts.join("\n");
}
