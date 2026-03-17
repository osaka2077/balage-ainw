/**
 * Browser Adapter Config — Browser-spezifische Konfiguration (Layer 1)
 *
 * ADR-013: Aus shared_interfaces.ts hierher verschoben,
 * damit Layer 2+ nichts von Browser-spezifischen Konzepten sieht.
 */

import { z } from "zod";

export const BrowserAdapterConfigSchema = z.object({
  headless: z.boolean().default(true),
  browserType: z
    .enum(["chromium", "firefox", "webkit"])
    .default("chromium"),

  // Viewport
  viewport: z
    .object({
      width: z.number().int().positive().default(1280),
      height: z.number().int().positive().default(720),
    })
    .default({}),

  // Proxy
  proxy: z
    .object({
      enabled: z.boolean().default(false),
      server: z.string().url().optional(),
      rotationStrategy: z
        .enum(["per_session", "per_request", "sticky"])
        .default("per_session"),
      provider: z.enum(["residential", "datacenter", "mobile"]).optional(),
      geoTarget: z.string().max(8).optional(),
    })
    .default({}),

  // Anti-Detection
  antiDetection: z
    .object({
      timing: z
        .object({
          minDelay: z.number().int().nonnegative().default(80),
          maxDelay: z.number().int().positive().default(250),
          typingSpeed: z
            .object({
              min: z.number().positive().default(6),
              max: z.number().positive().default(10),
            })
            .default({}),
          scrollBehavior: z
            .enum(["instant", "smooth_random"])
            .default("smooth_random"),
          mouseMovement: z
            .enum(["direct", "bezier_curve"])
            .default("bezier_curve"),
        })
        .default({}),
      fingerprint: z
        .object({
          randomizeViewport: z.boolean().default(true),
          viewportVariation: z.number().int().nonnegative().default(15),
          rotateUserAgent: z.boolean().default(true),
          userAgentPool: z.array(z.string()).default([]),
        })
        .default({}),
    })
    .default({}),

  // CAPTCHA
  captcha: z
    .object({
      detectionEnabled: z.boolean().default(true),
      onDetection: z
        .enum(["pause_and_escalate", "solve_via_service", "abort"])
        .default("pause_and_escalate"),
    })
    .default({}),

  // Lokalisierung
  locale: z.string().max(16).default("de-DE"),
  timezone: z.string().max(64).default("Europe/Berlin"),
  extraHTTPHeaders: z.record(z.string()).default({}),

  // Timeouts
  navigationTimeout: z.number().int().positive().default(30_000),
  actionTimeout: z.number().int().positive().default(10_000),
});
export type BrowserAdapterConfig = z.infer<typeof BrowserAdapterConfigSchema>;
