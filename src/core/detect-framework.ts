/**
 * Framework Detection — erkennt Web-Frameworks aus HTML-Inhalten.
 * Ermoeglicht vorgeladene Endpoint-Maps fuer bekannte Frameworks.
 */

import type { FrameworkDetection } from "./types.js";

interface FrameworkPattern {
  name: string;
  patterns: Array<{
    type: "meta" | "script" | "attribute" | "comment" | "content";
    regex: RegExp;
    weight: number;
  }>;
  versionPattern?: RegExp;
}

const FRAMEWORKS: FrameworkPattern[] = [
  {
    name: "shopify",
    patterns: [
      { type: "meta", regex: /Shopify\.theme/i, weight: 1.0 },
      { type: "script", regex: /cdn\.shopify\.com/i, weight: 0.9 },
      { type: "attribute", regex: /data-shopify/i, weight: 0.8 },
      { type: "content", regex: /shopify-section/i, weight: 0.7 },
    ],
  },
  {
    name: "wordpress",
    patterns: [
      { type: "meta", regex: /name="generator"[^>]*WordPress/i, weight: 1.0 },
      { type: "script", regex: /wp-content|wp-includes/i, weight: 0.9 },
      { type: "attribute", regex: /class="wp-/i, weight: 0.7 },
      { type: "content", regex: /wp-json/i, weight: 0.6 },
    ],
    versionPattern: /WordPress\s*([\d.]+)/i,
  },
  {
    name: "react",
    patterns: [
      { type: "attribute", regex: /data-reactroot|data-reactid/i, weight: 0.9 },
      { type: "attribute", regex: /__next|__NEXT_DATA__/i, weight: 0.8 },
      { type: "script", regex: /react\.production|react-dom/i, weight: 0.8 },
      { type: "attribute", regex: /data-rsc/i, weight: 0.7 },
    ],
  },
  {
    name: "nextjs",
    patterns: [
      { type: "attribute", regex: /__next|__NEXT_DATA__/i, weight: 1.0 },
      { type: "script", regex: /_next\/static/i, weight: 0.9 },
      { type: "meta", regex: /next-head-count/i, weight: 0.8 },
    ],
    versionPattern: /Next\.js\s*([\d.]+)/i,
  },
  {
    name: "angular",
    patterns: [
      { type: "attribute", regex: /ng-version|_ngcontent|_nghost/i, weight: 1.0 },
      { type: "attribute", regex: /ng-app|ng-controller/i, weight: 0.9 },
      { type: "script", regex: /angular\.min\.js|zone\.js/i, weight: 0.8 },
    ],
    versionPattern: /ng-version="([\d.]+)"/i,
  },
  {
    name: "vue",
    patterns: [
      { type: "attribute", regex: /data-v-[a-f0-9]/i, weight: 0.9 },
      { type: "attribute", regex: /data-server-rendered/i, weight: 0.8 },
      { type: "script", regex: /vue\.min\.js|vue\.runtime/i, weight: 0.8 },
    ],
  },
  {
    name: "svelte",
    patterns: [
      { type: "attribute", regex: /class="svelte-[a-z0-9]+"/i, weight: 0.9 },
      { type: "script", regex: /svelte/i, weight: 0.6 },
    ],
  },
  {
    name: "salesforce",
    patterns: [
      { type: "attribute", regex: /data-aura-rendered-by|aura:/i, weight: 1.0 },
      { type: "script", regex: /force\.com|salesforce/i, weight: 0.9 },
      { type: "content", regex: /lightning:/i, weight: 0.7 },
    ],
  },
];

export function detectFramework(html: string): FrameworkDetection | null {
  let bestMatch: { framework: FrameworkPattern; score: number; evidence: string[] } | null = null;

  for (const fw of FRAMEWORKS) {
    let score = 0;
    const evidence: string[] = [];

    for (const pattern of fw.patterns) {
      if (pattern.regex.test(html)) {
        score += pattern.weight;
        evidence.push(`${pattern.type}: ${pattern.regex.source}`);
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { framework: fw, score, evidence };
    }
  }

  if (!bestMatch || bestMatch.score < 0.6) return null;

  const maxScore = bestMatch.framework.patterns.reduce((sum, p) => sum + p.weight, 0);
  const confidence = Math.min(1, bestMatch.score / maxScore);

  let version: string | undefined;
  if (bestMatch.framework.versionPattern) {
    const match = html.match(bestMatch.framework.versionPattern);
    if (match) version = match[1];
  }

  return {
    framework: bestMatch.framework.name,
    confidence: Math.round(confidence * 100) / 100,
    version,
    evidence: bestMatch.evidence,
  };
}
