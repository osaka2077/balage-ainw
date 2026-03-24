/**
 * QA: Verify-Strategies Tests
 *
 * Testet die einzelnen Verification-Strategien:
 * - Login: URL-Change + Form verschwunden → verified
 * - Form: POST 200 + Success-Text → verified
 * - Navigation: URL-Change + neues Heading → verified
 * - Modal: Dialog hinzugefuegt / entfernt → verified
 *
 * Importiert aus src/core/verify-checks/strategies.ts (wird parallel in Terminal E erstellt).
 */

import { describe, it, expect } from "vitest";
import {
  verifyLogin,
  verifyForm,
  verifyNavigation,
  verifyModal,
} from "../../src/core/verify-checks/strategies.js";
import type { DomNode } from "../../shared_interfaces.js";

// ============================================================================
// Helpers
// ============================================================================

function makeDom(
  tagName: string,
  attrs: Record<string, string> = {},
  children: DomNode[] = [],
  overrides: Partial<DomNode> = {},
): DomNode {
  return {
    tagName,
    attributes: attrs,
    isVisible: true,
    isInteractive: false,
    children,
    ...overrides,
  };
}

// ============================================================================
// Login-Strategie
// ============================================================================

describe("verifyLogin", () => {
  it("returns 'verified' when URL changed and form is gone (conf >= 0.70)", () => {
    const result = verifyLogin({
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/dashboard",
      beforeDom: makeDom("body", {}, [
        makeDom("form", { action: "/login" }, [
          makeDom("input", { type: "email" }),
          makeDom("input", { type: "password" }),
          makeDom("button", {}, [], { textContent: "Sign In" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "Welcome to Dashboard" }),
        makeDom("nav", {}, [
          makeDom("a", { href: "/profile" }, [], { textContent: "Profile" }),
        ]),
      ]),
    });

    expect(result.status).toBe("verified");
    expect(result.confidence).toBeGreaterThanOrEqual(0.70);
  });

  it("returns 'failed' when URL unchanged and error message appears", () => {
    const result = verifyLogin({
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/login",
      beforeDom: makeDom("body", {}, [
        makeDom("form", { action: "/login" }, [
          makeDom("input", { type: "email" }),
          makeDom("input", { type: "password" }),
          makeDom("button", {}, [], { textContent: "Sign In" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("div", { class: "error", role: "alert" }, [], {
          textContent: "Invalid email or password",
        }),
        makeDom("form", { action: "/login" }, [
          makeDom("input", { type: "email" }),
          makeDom("input", { type: "password" }),
          makeDom("button", {}, [], { textContent: "Sign In" }),
        ]),
      ]),
    });

    expect(result.status).toBe("failed");
  });

  it("returns 'inconclusive' when URL unchanged and no DOM change", () => {
    const sameDom = makeDom("body", {}, [
      makeDom("form", { action: "/login" }, [
        makeDom("input", { type: "email" }),
        makeDom("input", { type: "password" }),
        makeDom("button", {}, [], { textContent: "Sign In" }),
      ]),
    ]);

    const result = verifyLogin({
      beforeUrl: "https://example.com/login",
      afterUrl: "https://example.com/login",
      beforeDom: sameDom,
      afterDom: sameDom,
    });

    expect(result.status).toBe("inconclusive");
  });
});

// ============================================================================
// Form-Strategie
// ============================================================================

describe("verifyForm", () => {
  it("returns 'verified' when POST 200 and success text appears", () => {
    const result = verifyForm({
      beforeUrl: "https://example.com/contact",
      afterUrl: "https://example.com/contact",
      beforeDom: makeDom("body", {}, [
        makeDom("form", { action: "/contact", method: "POST" }, [
          makeDom("input", { type: "text", name: "name" }),
          makeDom("textarea", { name: "message" }),
          makeDom("button", {}, [], { textContent: "Send" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("div", { class: "success" }, [], {
          textContent: "Thank you! Your message has been sent.",
        }),
      ]),
      httpStatus: 200,
    });

    expect(result.status).toBe("verified");
  });

  it("returns 'failed' when POST 400 and error text appears", () => {
    const result = verifyForm({
      beforeUrl: "https://example.com/contact",
      afterUrl: "https://example.com/contact",
      beforeDom: makeDom("body", {}, [
        makeDom("form", { action: "/contact", method: "POST" }, [
          makeDom("input", { type: "text", name: "name" }),
          makeDom("textarea", { name: "message" }),
          makeDom("button", {}, [], { textContent: "Send" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("div", { class: "error", role: "alert" }, [], {
          textContent: "Please fill in all required fields",
        }),
        makeDom("form", { action: "/contact", method: "POST" }, [
          makeDom("input", { type: "text", name: "name" }),
          makeDom("textarea", { name: "message" }),
          makeDom("button", {}, [], { textContent: "Send" }),
        ]),
      ]),
      httpStatus: 400,
    });

    expect(result.status).toBe("failed");
  });
});

// ============================================================================
// Navigation-Strategie
// ============================================================================

describe("verifyNavigation", () => {
  it("returns 'verified' when URL changed and new heading appears", () => {
    const result = verifyNavigation({
      beforeUrl: "https://example.com/",
      afterUrl: "https://example.com/about",
      beforeDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "Home" }),
        makeDom("nav", {}, [
          makeDom("a", { href: "/about" }, [], { textContent: "About" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("h1", {}, [], { textContent: "About Us" }),
        makeDom("p", {}, [], { textContent: "We are a company." }),
      ]),
    });

    expect(result.status).toBe("verified");
  });
});

// ============================================================================
// Modal-Strategie
// ============================================================================

describe("verifyModal", () => {
  it("returns 'verified' when dialog element added with backdrop", () => {
    const result = verifyModal({
      beforeUrl: "https://example.com/page",
      afterUrl: "https://example.com/page",
      beforeDom: makeDom("body", {}, [
        makeDom("div", { id: "content" }, [], { textContent: "Page content" }),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("div", { id: "content" }, [], { textContent: "Page content" }),
        makeDom("div", { class: "backdrop", role: "presentation" }),
        makeDom("div", { role: "dialog", "aria-modal": "true" }, [
          makeDom("h2", {}, [], { textContent: "Confirm Action" }),
          makeDom("button", {}, [], { textContent: "OK" }),
          makeDom("button", {}, [], { textContent: "Cancel" }),
        ]),
      ]),
    });

    expect(result.status).toBe("verified");
    expect(result.scenario).toBe("modal_open");
  });

  it("returns 'verified' when dialog removed (modal_close)", () => {
    const result = verifyModal({
      beforeUrl: "https://example.com/page",
      afterUrl: "https://example.com/page",
      beforeDom: makeDom("body", {}, [
        makeDom("div", { id: "content" }, [], { textContent: "Page content" }),
        makeDom("div", { class: "backdrop", role: "presentation" }),
        makeDom("div", { role: "dialog", "aria-modal": "true" }, [
          makeDom("h2", {}, [], { textContent: "Confirm Action" }),
          makeDom("button", {}, [], { textContent: "OK" }),
        ]),
      ]),
      afterDom: makeDom("body", {}, [
        makeDom("div", { id: "content" }, [], { textContent: "Page content" }),
      ]),
    });

    expect(result.status).toBe("verified");
    expect(result.scenario).toBe("modal_close");
  });
});
