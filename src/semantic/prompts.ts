/**
 * System-Prompts und Few-Shot-Templates fuer LLM-basierte Endpoint-Extraktion
 */

import type { PrunedSegment, GenerationContext } from "./types.js";

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
- Return at most 3 endpoints per segment. Only the most important, distinct ones.
- Prefer fewer, higher-confidence results. A segment rarely has more than 2 truly distinct endpoints.
- Only return endpoints that represent DISTINCT, user-facing interaction points. Do NOT return decorative elements, repeated navigation links, generic content sections, or footer links.
- Focus on PRIMARY functionality: main search bar, login/signup forms, checkout/cart, and the single most prominent navigation. Skip secondary nav, social links, language selectors, and cookie banners.
- If unsure whether something is a meaningful endpoint, include it with a LOW confidence score (0.3-0.5) rather than omitting it entirely. The confidence filter will handle borderline cases.
- A page typically has 3-6 truly important endpoints. Prefer fewer, high-quality results over many low-quality ones.
- Do NOT return multiple endpoints of the same type unless they serve clearly different purposes (e.g., a login form and a separate registration form are distinct; two navigation menus are NOT).

IMPORTANT — SEGMENT TYPE vs ENDPOINT TYPE:
- Each segment has a pre-classified type (e.g., "navigation", "form"). This classification is based on DOM structure, NOT content.
- The segment type is a HINT, not a constraint.
- A navigation section that contains search inputs is a SEARCH endpoint, not navigation.
- A form segment is an AUTH endpoint only if it has password/credential fields. A form without password fields is just "form".
- AUTH LINKS IN NAVIGATION — strict rules:
  - Navigation links that happen to include Login/SignUp are PART OF NAVIGATION, not separate auth endpoints. Do NOT emit a separate "auth" endpoint just because navigation contains auth-related links.
  - Only classify as "auth" if the segment contains ACTUAL credential input fields (password, email+password combo) or if the segment has 1-3 links that are ALL auth-related (Login, Sign Up, Account).
  - A header with "Products | Pricing | Login | Sign Up" is NAVIGATION, not auth+navigation.

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

CONFIDENCE CALIBRATION:
- 0.9-1.0: Certain — primary interactive element (login form, main search bar)
- 0.7-0.9: Likely real but secondary (newsletter signup, secondary nav)
- 0.5-0.7: Might be an endpoint — borderline cases
- Below 0.5: Probably not a meaningful endpoint — omit or assign very low confidence`;

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
            "Primary site navigation with links to Products, Solutions, Pricing, Resources, Blog, Login, and Get Started. Auth links are part of the navigation, not separate endpoints.",
          confidence: 0.88,
          anchors: [
            {
              selector: "nav",
              ariaRole: "navigation",
              ariaLabel: "Main",
            },
          ],
          affordances: [
            { type: "navigate", expectedOutcome: "Navigate to site section", reversible: true },
            { type: "navigate", expectedOutcome: "Navigate to login/signup page", reversible: true },
          ],
          reasoning:
            "NAV element with multiple links including Login and Get Started. Auth links without credential input fields are part of navigation — no separate auth endpoint.",
        },
      ],
      reasoning:
        "Header nav with section links + auth links but no credential fields. Single navigation endpoint — auth links are navigation targets, not auth endpoints.",
    },
  },
];

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Baut den User-Prompt fuer die LLM-basierte Endpoint-Extraktion zusammen.
 */
export function buildExtractionPrompt(
  prunedSegment: PrunedSegment,
  context: GenerationContext,
): string {
  const parts: string[] = [];

  parts.push("## Page Context");
  parts.push(`URL: ${context.url}`);
  if (context.pageTitle) {
    parts.push(`Title: ${context.pageTitle}`);
  }
  parts.push("");

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

  parts.push("## Few-Shot Examples");
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

  parts.push("## Your Task");
  parts.push(
    "Analyze the UI segment above and identify all interactive endpoints. Return valid JSON matching the format shown in the examples.",
  );

  return parts.join("\n");
}
