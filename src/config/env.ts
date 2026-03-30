/**
 * Environment Configuration — Typisierter Zugang zu API-Keys und LLM-Settings.
 *
 * Laedt .env.local via dotenv, validiert Pflichtfelder,
 * exportiert typisierte Config fuer den Rest des Systems.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

// .env.local laden (Projekt-Root)
loadDotenv({ path: resolve(process.cwd(), ".env.local") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// Types
// ============================================================================

export interface BalageEnvConfig {
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  llmProvider: "openai" | "anthropic";
  llmModel: string;
  llmFallbackModel: string;
  maxTokensPerRequest: number;
  maxCostPerRunUsd: number;
  hasAnyApiKey: boolean;

  // Firecrawl (FC-008)
  firecrawlApiKey: string | undefined;
  firecrawlApiUrl: string;
  firecrawlEnabled: boolean;
  firecrawlMaxResponseSizeMb: number;
  firecrawlTimeoutMs: number;
  allowHttp: boolean;
}

// ============================================================================
// Loader
// ============================================================================

function loadEnvConfig(): BalageEnvConfig {
  const openaiApiKey = process.env["BALAGE_OPENAI_API_KEY"] || undefined;
  const anthropicApiKey = process.env["BALAGE_ANTHROPIC_API_KEY"] || undefined;

  const providerRaw = process.env["BALAGE_LLM_PROVIDER"] ?? "openai";
  const llmProvider = providerRaw === "anthropic" ? "anthropic" : "openai";

  const llmModel = process.env["BALAGE_LLM_MODEL"] ?? "gpt-4o-mini";
  const llmFallbackModel = process.env["BALAGE_LLM_FALLBACK_MODEL"] ?? "gpt-4o";

  const maxTokensPerRequest = parseInt(
    process.env["BALAGE_MAX_TOKENS_PER_REQUEST"] ?? "4096",
    10,
  );
  const maxCostPerRunUsd = parseFloat(
    process.env["BALAGE_MAX_COST_PER_RUN_USD"] ?? "1.00",
  );

  // Firecrawl Config (FC-008)
  const firecrawlApiKey = process.env["BALAGE_FIRECRAWL_API_KEY"] || undefined;
  const firecrawlApiUrl = process.env["BALAGE_FIRECRAWL_API_URL"] ?? "https://api.firecrawl.dev";
  const firecrawlEnabled = process.env["BALAGE_FIRECRAWL_ENABLED"] === "true";
  const firecrawlMaxResponseSizeMb = parseFloat(
    process.env["BALAGE_FIRECRAWL_MAX_RESPONSE_SIZE_MB"] ?? "5",
  );
  const firecrawlTimeoutMs = parseInt(
    process.env["BALAGE_FIRECRAWL_TIMEOUT_MS"] ?? "30000",
    10,
  );
  const allowHttp = process.env["BALAGE_ALLOW_HTTP"] === "true";

  return {
    openaiApiKey,
    anthropicApiKey,
    llmProvider,
    llmModel,
    llmFallbackModel,
    maxTokensPerRequest: Number.isFinite(maxTokensPerRequest) ? maxTokensPerRequest : 4096,
    maxCostPerRunUsd: Number.isFinite(maxCostPerRunUsd) ? maxCostPerRunUsd : 1.0,
    hasAnyApiKey: !!(openaiApiKey || anthropicApiKey),

    // Firecrawl (FC-008)
    firecrawlApiKey,
    firecrawlApiUrl,
    firecrawlEnabled,
    firecrawlMaxResponseSizeMb: Number.isFinite(firecrawlMaxResponseSizeMb) ? firecrawlMaxResponseSizeMb : 5,
    firecrawlTimeoutMs: Number.isFinite(firecrawlTimeoutMs) ? firecrawlTimeoutMs : 30_000,
    allowHttp,
  };
}

/**
 * Validiert dass mindestens ein API-Key vorhanden ist.
 * Wirft Error wenn keiner gesetzt — nur aufrufen wenn LLM-Calls noetig sind.
 */
export function validateApiKeys(cfg: BalageEnvConfig): void {
  if (!cfg.hasAnyApiKey) {
    throw new Error(
      "No LLM API key configured. Set BALAGE_OPENAI_API_KEY or BALAGE_ANTHROPIC_API_KEY in .env.local",
    );
  }
}

/** Singleton — wird einmal geladen, dann gecacht */
export const envConfig: BalageEnvConfig = loadEnvConfig();
