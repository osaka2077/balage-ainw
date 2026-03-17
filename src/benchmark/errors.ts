/**
 * BALAGE Benchmark Suite — Error Classes
 */

export class BenchmarkError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BenchmarkError";
    this.code = code;
    this.details = details;
  }
}

export class CorpusNotFoundError extends BenchmarkError {
  constructor(corpusId: string) {
    super(`Corpus entry not found: ${corpusId}`, "CORPUS_NOT_FOUND", { corpusId });
  }
}

export class GroundTruthMissingError extends BenchmarkError {
  constructor(corpusId: string) {
    super(`Ground truth missing for corpus: ${corpusId}`, "GROUND_TRUTH_MISSING", { corpusId });
  }
}

export class FixtureTimeoutError extends BenchmarkError {
  constructor(corpusId: string, timeoutMs: number) {
    super(
      `Fixture timed out after ${timeoutMs}ms: ${corpusId}`,
      "FIXTURE_TIMEOUT",
      { corpusId, timeoutMs },
    );
  }
}

export class MetricsCalculationError extends BenchmarkError {
  constructor(message: string) {
    super(message, "METRICS_CALCULATION_ERROR");
  }
}

export class ReportGenerationError extends BenchmarkError {
  constructor(message: string) {
    super(message, "REPORT_GENERATION_ERROR");
  }
}
