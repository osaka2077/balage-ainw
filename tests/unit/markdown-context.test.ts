/**
 * Markdown-Context Tests (FC-018)
 *
 * Tests fuer:
 * - extractMarkdownSummary(): Content-aware Truncation
 * - classifyPageType(): Regelbasierter Page-Type-Classifier
 * - isMarkdownContextEnabled(): Feature-Flag Verhalten
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractMarkdownSummary,
  classifyPageType,
  isMarkdownContextEnabled,
} from "../../src/semantic/markdown-context.js";

// ============================================================================
// extractMarkdownSummary
// ============================================================================

describe("extractMarkdownSummary", () => {
  it("should return empty string for empty input", () => {
    expect(extractMarkdownSummary("")).toBe("");
    expect(extractMarkdownSummary("   ")).toBe("");
  });

  it("should prioritize headings over regular text", () => {
    const md = [
      "Some paragraph text that is not very important.",
      "Another boring paragraph.",
      "# Main Title",
      "Important first paragraph after heading.",
      "## Login Section",
      "This section has a login form.",
      "Random text at the bottom that nobody cares about.",
      "More filler text here.",
    ].join("\n");

    const summary = extractMarkdownSummary(md);
    expect(summary).toContain("# Main Title");
    expect(summary).toContain("## Login Section");
  });

  it("should include paragraphs right after headings", () => {
    const md = [
      "# Welcome",
      "This is the welcome paragraph.",
      "",
      "This is far from the heading.",
    ].join("\n");

    const summary = extractMarkdownSummary(md);
    expect(summary).toContain("# Welcome");
    expect(summary).toContain("This is the welcome paragraph.");
  });

  it("should prioritize lines with interactive keywords", () => {
    const md = [
      "Generic content that is not relevant.",
      "More generic stuff.",
      "More generic stuff again.",
      "More generic stuff yet again.",
      "Click here to login to your account.",
      "Add to cart button is visible.",
      "Even more generic content here.",
    ].join("\n");

    const summary = extractMarkdownSummary(md);
    expect(summary).toContain("login");
    expect(summary).toContain("cart");
  });

  it("should skip footer and navigation boilerplate", () => {
    const md = [
      "# Main Content",
      "Interesting content here.",
      "- [Home](/) ",
      "- [About](/about)",
      "- [Privacy Policy](/privacy)",
      "privacy policy",
      "terms of service",
      "© 2024 Company Inc.",
    ].join("\n");

    const summary = extractMarkdownSummary(md);
    expect(summary).toContain("# Main Content");
    expect(summary).not.toContain("privacy");
    expect(summary).not.toContain("© 2024");
  });

  it("should respect the token limit", () => {
    // 10 Tokens ≈ 40 Chars — Force sehr kurze Summary
    const md = [
      "# Title",
      "Short paragraph.",
      "## Second Heading",
      "Another paragraph that is longer.",
      "### Third Heading With Extra Words",
      "Yet another paragraph with even more text to exceed the limit.",
    ].join("\n");

    const summary = extractMarkdownSummary(md, 10);
    // Maximal ~40 Chars bei 10 Tokens
    expect(summary.length).toBeLessThanOrEqual(50);
  });

  it("should maintain original line order in output", () => {
    const md = [
      "# First",
      "Para after first.",
      "## Second",
      "Para after second.",
    ].join("\n");

    const summary = extractMarkdownSummary(md);
    const firstIdx = summary.indexOf("# First");
    const secondIdx = summary.indexOf("## Second");
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it("should handle markdown with only headings", () => {
    const md = [
      "# Title",
      "## Section A",
      "## Section B",
    ].join("\n");

    const summary = extractMarkdownSummary(md);
    expect(summary).toContain("# Title");
    expect(summary).toContain("## Section A");
  });

  it("should handle very long single line", () => {
    const longLine = "# " + "x".repeat(5000);
    const summary = extractMarkdownSummary(longLine, 50);
    // Sollte gekuerzt werden, nicht crashen
    expect(summary.length).toBeLessThanOrEqual(210); // ~50 tokens * 4 chars + overhead
  });
});

// ============================================================================
// classifyPageType
// ============================================================================

describe("classifyPageType", () => {
  it("should return 'generic' for empty input", () => {
    expect(classifyPageType("")).toBe("generic");
    expect(classifyPageType("   ")).toBe("generic");
  });

  it("should classify e-commerce pages", () => {
    const md = `
# Product Catalog
Add to cart - Buy now
Price: $29.99
Shop our collection
    `;
    expect(classifyPageType(md)).toBe("e-commerce");
  });

  it("should classify travel pages", () => {
    const md = `
# Book your hotel
Check-in date: March 15
Check-out date: March 20
Destination: Paris
Flight options available
    `;
    expect(classifyPageType(md)).toBe("travel");
  });

  it("should classify SaaS pages", () => {
    const md = `
# Start your free trial
Pricing plans
Enterprise features
Dashboard overview
Monthly billing
    `;
    expect(classifyPageType(md)).toBe("saas");
  });

  it("should classify documentation pages", () => {
    const md = `
# API Reference
Getting started guide
Installation instructions
SDK parameters
    `;
    expect(classifyPageType(md)).toBe("documentation");
  });

  it("should classify news pages", () => {
    const md = `
# Breaking: Major Event
Published: March 2026
Author: Jane Doe
Article continues below
    `;
    expect(classifyPageType(md)).toBe("news");
  });

  it("should classify login pages", () => {
    const md = `
# Sign In
Enter your password
SSO login available
Forgot password link
    `;
    expect(classifyPageType(md)).toBe("login-page");
  });

  it("should return 'generic' for ambiguous content", () => {
    const md = `
# Welcome to Our Website
We are a great company.
Contact us for more information.
    `;
    expect(classifyPageType(md)).toBe("generic");
  });

  it("should pick the type with most keyword matches", () => {
    // E-commerce hat mehr matches als SaaS hier
    const md = `
# Online Shop
Price: $10
Add to cart
Product details
Buy now
Shop collection
Pricing plan available
    `;
    expect(classifyPageType(md)).toBe("e-commerce");
  });
});

// ============================================================================
// Feature-Flag: isMarkdownContextEnabled
// ============================================================================

describe("isMarkdownContextEnabled", () => {
  const originalEnv = process.env["BALAGE_MARKDOWN_CONTEXT"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["BALAGE_MARKDOWN_CONTEXT"];
    } else {
      process.env["BALAGE_MARKDOWN_CONTEXT"] = originalEnv;
    }
  });

  it("should return false when env var is not set", () => {
    delete process.env["BALAGE_MARKDOWN_CONTEXT"];
    expect(isMarkdownContextEnabled()).toBe(false);
  });

  it("should return false when env var is '0'", () => {
    process.env["BALAGE_MARKDOWN_CONTEXT"] = "0";
    expect(isMarkdownContextEnabled()).toBe(false);
  });

  it("should return true when env var is '1'", () => {
    process.env["BALAGE_MARKDOWN_CONTEXT"] = "1";
    expect(isMarkdownContextEnabled()).toBe(true);
  });

  it("should return false for other values", () => {
    process.env["BALAGE_MARKDOWN_CONTEXT"] = "true";
    expect(isMarkdownContextEnabled()).toBe(false);

    process.env["BALAGE_MARKDOWN_CONTEXT"] = "yes";
    expect(isMarkdownContextEnabled()).toBe(false);
  });
});
