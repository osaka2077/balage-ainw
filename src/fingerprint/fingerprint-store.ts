/**
 * FingerprintStore — In-Memory Cache mit LRU-Eviction.
 */

import pino from "pino";
import type { SemanticFingerprint } from "./types.js";
import type {
  StoredFingerprint,
  FingerprintStoreOptions,
} from "./types.js";
import { calculateSimilarity } from "./similarity.js";
import { StoreError } from "./errors.js";

const logger = pino({ name: "fingerprint:store" });

const DEFAULT_MAX_SIZE = 1000;

export class FingerprintStore {
  private readonly maxSize: number;
  private readonly byHash: Map<string, StoredFingerprint>;
  private readonly bySiteUrl: Map<string, Set<string>>;
  private readonly historyMap: Map<string, SemanticFingerprint[]>;

  constructor(options?: FingerprintStoreOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
    this.byHash = new Map();
    this.bySiteUrl = new Map();
    this.historyMap = new Map();
  }

  store(
    siteId: string,
    url: string,
    fingerprint: SemanticFingerprint,
  ): void {
    try {
      if (this.byHash.size >= this.maxSize) {
        this.evict();
      }

      const existing = this.byHash.get(fingerprint.hash);
      if (existing) {
        existing.fingerprint = fingerprint;
        existing.lastAccessedAt = new Date();
        existing.accessCount++;

        const hist = this.historyMap.get(fingerprint.hash) ?? [];
        hist.push(fingerprint);
        this.historyMap.set(fingerprint.hash, hist);
      } else {
        const stored: StoredFingerprint = {
          fingerprint,
          siteId,
          url,
          storedAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 0,
        };

        this.byHash.set(fingerprint.hash, stored);

        const key = `${siteId}:${url}`;
        const urlSet = this.bySiteUrl.get(key) ?? new Set();
        urlSet.add(fingerprint.hash);
        this.bySiteUrl.set(key, urlSet);

        this.historyMap.set(fingerprint.hash, [fingerprint]);
      }

      logger.debug(
        { hash: fingerprint.hash.slice(0, 16), siteId, url },
        "fingerprint stored",
      );
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError(
        `Failed to store fingerprint: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  get(hash: string): StoredFingerprint | undefined {
    const stored = this.byHash.get(hash);
    if (stored) {
      stored.lastAccessedAt = new Date();
      stored.accessCount++;
    }
    return stored;
  }

  getForUrl(siteId: string, url: string): StoredFingerprint[] {
    const key = `${siteId}:${url}`;
    const hashes = this.bySiteUrl.get(key);
    if (!hashes) return [];

    const results: StoredFingerprint[] = [];
    for (const hash of hashes) {
      const stored = this.get(hash);
      if (stored) results.push(stored);
    }
    return results;
  }

  getHistory(hash: string): SemanticFingerprint[] {
    return this.historyMap.get(hash) ?? [];
  }

  findSimilar(
    fingerprint: SemanticFingerprint,
    threshold = 0.8,
  ): StoredFingerprint[] {
    const results: StoredFingerprint[] = [];

    for (const stored of this.byHash.values()) {
      if (stored.fingerprint.hash === fingerprint.hash) continue;
      const result = calculateSimilarity(
        fingerprint,
        stored.fingerprint,
      );
      if (result.score >= threshold) {
        results.push(stored);
      }
    }

    return results;
  }

  delete(hash: string): boolean {
    const stored = this.byHash.get(hash);
    if (!stored) return false;

    this.byHash.delete(hash);

    const key = `${stored.siteId}:${stored.url}`;
    const urlSet = this.bySiteUrl.get(key);
    if (urlSet) {
      urlSet.delete(hash);
      if (urlSet.size === 0) this.bySiteUrl.delete(key);
    }

    this.historyMap.delete(hash);

    return true;
  }

  clear(): void {
    this.byHash.clear();
    this.bySiteUrl.clear();
    this.historyMap.clear();
  }

  size(): number {
    return this.byHash.size;
  }

  evict(): void {
    if (this.byHash.size === 0) return;

    let oldest: { hash: string; time: Date } | undefined;

    for (const [hash, stored] of this.byHash) {
      if (!oldest || stored.lastAccessedAt < oldest.time) {
        oldest = { hash, time: stored.lastAccessedAt };
      }
    }

    if (oldest) {
      this.delete(oldest.hash);
      logger.debug(
        { hash: oldest.hash.slice(0, 16) },
        "evicted LRU entry",
      );
    }
  }
}
