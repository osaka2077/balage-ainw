/**
 * BALAGE Baseline — Error-Klassen
 */

export class BaselineError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BaselineError";
    this.code = code;
    this.details = details;
  }
}

export class ScreenshotCaptureError extends BaselineError {
  constructor(corpusId: string, cause?: string) {
    super(
      `Failed to capture screenshot for: ${corpusId}${cause ? ` — ${cause}` : ""}`,
      "SCREENSHOT_CAPTURE_ERROR",
      { corpusId },
    );
    this.name = "ScreenshotCaptureError";
  }
}

export class ScreenshotTimeoutError extends BaselineError {
  constructor(corpusId: string, timeoutMs: number) {
    super(
      `Screenshot timed out after ${timeoutMs}ms: ${corpusId}`,
      "SCREENSHOT_TIMEOUT",
      { corpusId, timeoutMs },
    );
    this.name = "ScreenshotTimeoutError";
  }
}

export class VisionAnalysisError extends BaselineError {
  constructor(corpusId: string, cause?: string) {
    super(
      `Vision analysis failed for: ${corpusId}${cause ? ` — ${cause}` : ""}`,
      "VISION_ANALYSIS_ERROR",
      { corpusId },
    );
    this.name = "VisionAnalysisError";
  }
}

export class VisionApiError extends BaselineError {
  constructor(provider: string, statusCode: number, message: string) {
    super(
      `Vision API error (${provider}): ${statusCode} — ${message}`,
      "VISION_API_ERROR",
      { provider, statusCode },
    );
    this.name = "VisionApiError";
  }
}

export class BaselineRunnerError extends BaselineError {
  constructor(message: string) {
    super(message, "BASELINE_RUNNER_ERROR");
    this.name = "BaselineRunnerError";
  }
}
