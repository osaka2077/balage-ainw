/**
 * BALAGE Benchmark Suite — BenchmarkRunner
 *
 * Orchestriert den Durchlauf aller Corpus-Fixtures,
 * sammelt Rohdaten und berechnet Summary-Metriken.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "../observability/index.js";
import { getCorpus, getCorpusByCategory, getCorpusEntry } from "./corpus.js";
import { CorpusNotFoundError, FixtureTimeoutError, GroundTruthMissingError } from "./errors.js";
import { getGroundTruthForCorpus } from "./ground-truth.js";
import { calculateMetrics } from "./metrics.js";
import type {
  BenchmarkConfig,
  BenchmarkProgress,
  BenchmarkRun,
  CorpusCategory,
  CorpusEntry,
  DetectedEndpoint,
  EndpointDetector,
  FixtureResult,
} from "./types.js";

const logger = createLogger({ name: "benchmark:runner" });

const DEFAULT_CONFIG: Required<BenchmarkConfig> = {
  corpusFilter: [],
  concurrency: 1,
  timeout: 30_000,
  collectTokenUsage: true,
  warmup: false,
};

export class BenchmarkRunner {
  private readonly config: Required<BenchmarkConfig>;
  private readonly detector: EndpointDetector;
  private progressCallbacks: Array<(progress: BenchmarkProgress) => void> = [];
  private aborted = false;

  constructor(detector: EndpointDetector, config?: BenchmarkConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detector = detector;
  }

  /**
   * Alle Corpus-Fixtures durchlaufen.
   */
  async runAll(): Promise<BenchmarkRun> {
    this.aborted = false;

    let corpus: CorpusEntry[];
    if (this.config.corpusFilter.length > 0) {
      corpus = this.config.corpusFilter.flatMap((cat) => getCorpusByCategory(cat));
    } else {
      corpus = getCorpus();
    }

    logger.info("Starting benchmark run", {
      fixtureCount: corpus.length,
      concurrency: this.config.concurrency,
      timeout: this.config.timeout,
    });

    const run: BenchmarkRun = {
      id: randomUUID(),
      startedAt: new Date(),
      config: this.config,
      results: [],
    };

    const startTime = performance.now();

    // Warmup-Durchlauf (optional, Ergebnisse werden verworfen)
    if (this.config.warmup && corpus.length > 0) {
      const warmupEntry = corpus[0]!;
      logger.info("Running warmup fixture", { corpusId: warmupEntry.id });
      await this.executeFixture(warmupEntry);
    }

    // Sequentiell oder parallel durchlaufen
    if (this.config.concurrency <= 1) {
      for (let i = 0; i < corpus.length; i++) {
        if (this.aborted) break;

        const entry = corpus[i]!;
        const result = await this.executeFixture(entry);
        run.results.push(result);

        this.emitProgress({
          completed: i + 1,
          total: corpus.length,
          currentFixture: entry.id,
          elapsedMs: Math.round(performance.now() - startTime),
        });
      }
    } else {
      // Parallele Ausfuehrung in Batches
      for (let i = 0; i < corpus.length; i += this.config.concurrency) {
        if (this.aborted) break;

        const batch = corpus.slice(i, i + this.config.concurrency);
        const batchResults = await Promise.all(
          batch.map((entry) => this.executeFixture(entry)),
        );
        run.results.push(...batchResults);

        const completed = Math.min(i + this.config.concurrency, corpus.length);
        const lastEntry = batch[batch.length - 1]!;
        this.emitProgress({
          completed,
          total: corpus.length,
          currentFixture: lastEntry.id,
          elapsedMs: Math.round(performance.now() - startTime),
        });
      }
    }

    run.completedAt = new Date();

    // Summary berechnen
    if (run.results.length > 0) {
      run.summary = calculateMetrics(run.results);
    }

    logger.info("Benchmark run completed", {
      runId: run.id,
      fixtureCount: run.results.length,
      durationMs: Math.round(performance.now() - startTime),
    });

    return run;
  }

  /**
   * Einzelne Fixture durchlaufen.
   */
  async runFixture(corpusId: string): Promise<FixtureResult> {
    const entry = getCorpusEntry(corpusId);
    if (!entry) {
      throw new CorpusNotFoundError(corpusId);
    }
    return this.executeFixture(entry);
  }

  /**
   * Alle Fixtures einer Kategorie durchlaufen.
   */
  async runCategory(category: CorpusCategory): Promise<BenchmarkRun> {
    const originalFilter = this.config.corpusFilter;
    this.config.corpusFilter = [category];
    const run = await this.runAll();
    this.config.corpusFilter = originalFilter;
    return run;
  }

  /**
   * Laufenden Benchmark abbrechen.
   */
  abort(): void {
    this.aborted = true;
    logger.warn("Benchmark run aborted");
  }

  /**
   * Fortschritt-Callback registrieren.
   */
  onProgress(callback: (progress: BenchmarkProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Einzelne Fixture ausfuehren und Ergebnis zurueckgeben.
   */
  private async executeFixture(entry: CorpusEntry): Promise<FixtureResult> {
    const groundTruth = getGroundTruthForCorpus(entry.id);
    if (!groundTruth) {
      throw new GroundTruthMissingError(entry.id);
    }

    const startTime = performance.now();
    let detectedEndpoints: DetectedEndpoint[] = [];
    const errors: string[] = [];

    try {
      // Timeout-Wrapper
      detectedEndpoints = await Promise.race([
        this.detector.detect(entry.html, entry.url),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new FixtureTimeoutError(entry.id, this.config.timeout)),
            this.config.timeout,
          );
        }),
      ]);
    } catch (err) {
      if (err instanceof FixtureTimeoutError) {
        errors.push(err.message);
        logger.warn("Fixture timed out", { corpusId: entry.id, timeout: this.config.timeout });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(message);
        logger.error("Fixture execution failed", { corpusId: entry.id, error: message });
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      corpusId: entry.id,
      category: entry.category,
      detectedEndpoints,
      groundTruth: groundTruth.endpoints,
      latencyMs,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      errors,
    };
  }

  private emitProgress(progress: BenchmarkProgress): void {
    for (const cb of this.progressCallbacks) {
      try {
        cb(progress);
      } catch {
        // Callback-Fehler ignorieren
      }
    }
  }
}
