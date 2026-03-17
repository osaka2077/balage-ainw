/**
 * BALAGE Baseline — Vision Analyzer
 *
 * Sendet Screenshots an LLM Vision API (OpenAI / Anthropic) und parst Endpoints.
 * MockVisionAnalyzer liefert deterministische Antworten fuer Tests.
 */

import { createLogger } from "../observability/index.js";
import type {
  VisionAnalyzerConfig,
  VisionAnalysisResult,
  ScreenshotResult,
  DetectedEndpoint,
} from "./types.js";
import { VisionAnalysisError, VisionApiError } from "./errors.js";

const logger = createLogger({ name: "baseline:vision" });

export const VISION_PROMPT = `Analyze this screenshot of a web page. Identify all interactive UI endpoints.

For each endpoint, provide:
- type: one of "form", "checkout", "support", "navigation", "auth", "search", "commerce", "content", "consent", "media", "social", "settings"
- label: descriptive name of the endpoint
- confidence: your confidence this is a real interactive endpoint (0.0-1.0)
- riskLevel: "low", "medium", "high", or "critical"
- affordances: what actions can be performed (e.g., ["click"], ["fill", "submit"])

Respond as a JSON array of objects. Only include actually interactive elements.`;

export class VisionAnalyzer {
  protected readonly config: VisionAnalyzerConfig;

  constructor(config: VisionAnalyzerConfig) {
    this.config = {
      model: config.provider === "openai" ? "gpt-4o" : "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0,
      ...config,
    };
  }

  async analyze(screenshot: ScreenshotResult): Promise<VisionAnalysisResult> {
    if (this.config.provider === "mock") {
      throw new VisionAnalysisError(
        screenshot.corpusId,
        "Use MockVisionAnalyzer for mock provider",
      );
    }

    if (!this.config.apiKey) {
      throw new VisionApiError(this.config.provider, 401, "API key required");
    }

    try {
      const start = performance.now();
      const result = await this.callVisionApi(screenshot);
      const latencyMs = performance.now() - start;

      logger.info("Vision analysis complete", {
        corpusId: screenshot.corpusId,
        provider: this.config.provider,
        endpoints: result.detectedEndpoints.length,
        latencyMs,
      });

      return { ...result, latencyMs };
    } catch (error) {
      if (error instanceof VisionApiError || error instanceof VisionAnalysisError) {
        throw error;
      }
      throw new VisionAnalysisError(
        screenshot.corpusId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async analyzeBatch(screenshots: ScreenshotResult[]): Promise<VisionAnalysisResult[]> {
    logger.info("Starting batch analysis", { count: screenshots.length });
    const results: VisionAnalysisResult[] = [];

    for (const screenshot of screenshots) {
      const result = await this.analyze(screenshot);
      results.push(result);
    }

    return results;
  }

  private async callVisionApi(screenshot: ScreenshotResult): Promise<VisionAnalysisResult> {
    const base64Image = screenshot.imageBuffer.toString("base64");
    const mimeType = screenshot.format === "png" ? "image/png" : "image/jpeg";

    if (this.config.provider === "openai") {
      return this.callOpenAi(screenshot.corpusId, base64Image, mimeType);
    }
    if (this.config.provider === "anthropic") {
      return this.callAnthropic(screenshot.corpusId, base64Image, mimeType);
    }

    throw new VisionAnalysisError(screenshot.corpusId, `Unknown provider: ${this.config.provider}`);
  }

  private async callOpenAi(
    corpusId: string,
    base64Image: string,
    mimeType: string,
  ): Promise<VisionAnalysisResult> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: this.config.apiKey });

    const start = performance.now();
    const response = await client.chat.completions.create({
      model: this.config.model ?? "gpt-4o",
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ],
        },
      ],
    });

    const latencyMs = performance.now() - start;
    const rawResponse = response.choices[0]?.message?.content ?? "[]";
    const endpoints = this.parseEndpoints(corpusId, rawResponse);

    return {
      corpusId,
      detectedEndpoints: endpoints,
      rawResponse,
      tokenUsage: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      latencyMs,
    };
  }

  private async callAnthropic(
    corpusId: string,
    base64Image: string,
    mimeType: string,
  ): Promise<VisionAnalysisResult> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: this.config.apiKey });

    const mediaType = mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    const start = performance.now();
    const response = await client.messages.create({
      model: this.config.model ?? "claude-sonnet-4-20250514",
      max_tokens: this.config.maxTokens ?? 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });

    const latencyMs = performance.now() - start;
    const rawResponse = response.content
      .filter((block) => block.type === "text")
      .map((block) => ("text" in block ? block.text : ""))
      .join("");
    const endpoints = this.parseEndpoints(corpusId, rawResponse);

    return {
      corpusId,
      detectedEndpoints: endpoints,
      rawResponse,
      tokenUsage: {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs,
    };
  }

  protected parseEndpoints(corpusId: string, rawResponse: string): DetectedEndpoint[] {
    try {
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn("No JSON array found in vision response", { corpusId });
        return [];
      }

      const parsed: unknown[] = JSON.parse(jsonMatch[0]);
      return parsed.map((item) => {
        const obj = item as Record<string, unknown>;
        return {
          type: String(obj["type"] ?? "content") as DetectedEndpoint["type"],
          label: String(obj["label"] ?? "unknown"),
          confidence: Number(obj["confidence"] ?? 0.5),
          riskLevel: String(obj["riskLevel"] ?? "low") as DetectedEndpoint["riskLevel"],
          affordances: Array.isArray(obj["affordances"])
            ? (obj["affordances"] as string[])
            : ["click"],
        };
      });
    } catch (error) {
      logger.error("Failed to parse vision response", { corpusId, error: String(error) });
      throw new VisionAnalysisError(corpusId, "Failed to parse LLM response");
    }
  }
}

export class MockVisionAnalyzer extends VisionAnalyzer {
  private readonly mockResponses: Map<string, DetectedEndpoint[]>;

  constructor(mockResponses?: Map<string, DetectedEndpoint[]>) {
    super({ provider: "mock" });
    this.mockResponses = mockResponses ?? new Map();
  }

  override async analyze(screenshot: ScreenshotResult): Promise<VisionAnalysisResult> {
    // Simulierte Vision-Latenz: 500-2000ms (deterministisch basierend auf corpusId-Laenge)
    const latencyMs = 500 + (screenshot.corpusId.length * 47) % 1500;

    const endpoints = this.mockResponses.get(screenshot.corpusId)
      ?? this.getDefaultMockResponse();

    const rawResponse = JSON.stringify(endpoints);

    // Vision-Modelle verbrauchen viele Tokens fuer Bilder
    const promptTokens = 1500 + (screenshot.corpusId.length * 31) % 500;
    const completionTokens = 200 + (screenshot.corpusId.length * 17) % 300;

    logger.debug("Mock vision analysis", {
      corpusId: screenshot.corpusId,
      endpointsFound: endpoints.length,
      latencyMs,
    });

    return {
      corpusId: screenshot.corpusId,
      detectedEndpoints: endpoints,
      rawResponse,
      tokenUsage: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      latencyMs,
    };
  }

  private getDefaultMockResponse(): DetectedEndpoint[] {
    return [
      {
        type: "navigation",
        label: "Main Navigation",
        confidence: 0.85,
        riskLevel: "low",
        affordances: ["click"],
      },
      {
        type: "content",
        label: "Page Content",
        confidence: 0.6,
        riskLevel: "low",
        affordances: ["read"],
      },
    ];
  }
}
