/**
 * Fingerprint-basierter Result-Cache fuer analyzeFromHTML.
 *
 * Nutzt semantische Fingerprints fuer exakten und similarity-basierten
 * Cache-Lookup. Alle Fingerprint-Module werden lazy geladen.
 */

import type { SemanticFingerprint, UISegment } from "../../shared_interfaces.js";
import type { AnalysisResult, FingerprintCacheOptions } from "./types.js";
import pino from "pino";

const logger = pino({ name: "balage:cache", level: process.env["LOG_LEVEL"] ?? "silent" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheLookupResult {
  hit: boolean;
  result?: AnalysisResult;
  similarity?: number;
  fingerprints?: SemanticFingerprint[];
  fingerprintHash?: string;
}

interface CachedResult {
  result: AnalysisResult;
  storedAt: number;
  fingerprints: SemanticFingerprint[];
}

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

const _resultCache = new Map<string, CachedResult>();
const _urlIndex = new Map<string, Set<string>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded, type-safe at call sites
let _store: any;

// ---------------------------------------------------------------------------
// Lazy Module Loading (verhindert Bundle-Bloat)
// ---------------------------------------------------------------------------

async function loadModules() {
  const [featuresMod, calcMod, simMod, storeMod] = await Promise.all([
    import("../fingerprint/feature-extractor.js"),
    import("../fingerprint/fingerprint-calculator.js"),
    import("../fingerprint/similarity.js"),
    import("../fingerprint/fingerprint-store.js"),
  ]);
  return {
    extractFeatures: featuresMod.extractFeatures,
    calculateFingerprint: calcMod.calculateFingerprint,
    calculateSimilarity: simMod.calculateSimilarity,
    FingerprintStore: storeMod.FingerprintStore,
  };
}

function parseSiteId(url: string, options: FingerprintCacheOptions): string {
  if (options.siteId) return options.siteId;
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sucht im Cache nach einem passenden Analyse-Ergebnis.
 *
 * Strategie:
 * 1. Fingerprints fuer interaktive Segmente berechnen
 * 2. Sortierte Segment-Hashes → pageHash
 * 3. Exakter pageHash-Match (O(1))
 * 4. Similarity-basierter Fallback via URL-Index
 * 5. TTL-Check: abgelaufene Eintraege ignorieren
 */
export async function lookupCache(
  segments: UISegment[],
  url: string,
  options: FingerprintCacheOptions = {},
): Promise<CacheLookupResult> {
  const threshold = options.similarityThreshold ?? 0.95;
  const ttlMs = options.ttlMs ?? 3600000;
  const siteId = parseSiteId(url, options);

  const { extractFeatures, calculateFingerprint, calculateSimilarity, FingerprintStore } =
    await loadModules();

  // 1. Fingerprints fuer interaktive Segmente berechnen
  const interactiveSegments = segments.filter(s => s.interactiveElementCount >= 1);
  const fingerprints: SemanticFingerprint[] = [];
  for (const segment of interactiveSegments) {
    try {
      const features = extractFeatures(segment);
      const fp = calculateFingerprint(features);
      fingerprints.push(fp);
    } catch (err) {
      logger.debug({ err, segmentType: segment.type }, "Fingerprint extraction failed for segment");
    }
  }

  // 2. Sortierte Hashes → pageHash
  const pageHash = fingerprints
    .map(fp => fp.hash)
    .sort()
    .join("|");

  if (!pageHash) {
    return { hit: false, fingerprints, fingerprintHash: pageHash };
  }

  // 3. Exakter Match (O(1))
  const exactMatch = _resultCache.get(pageHash);
  if (exactMatch && (Date.now() - exactMatch.storedAt) < ttlMs) {
    logger.debug({ pageHash }, "Cache hit (exact)");
    return {
      hit: true,
      result: exactMatch.result,
      similarity: 1.0,
      fingerprints,
      fingerprintHash: pageHash,
    };
  }

  // 4. Similarity-basierter Fallback ueber URL-Index
  if (!_store) {
    _store = new FingerprintStore({ maxSize: options.maxSize ?? 1000 });
  }
  const storedFps = _store.getForUrl(siteId, url);

  if (storedFps.length > 0 && fingerprints.length > 0) {
    const urlHashes = _urlIndex.get(url);
    if (urlHashes) {
      let bestMatch: { similarity: number; result: AnalysisResult } | undefined;

      for (const cachedHash of urlHashes) {
        if (cachedHash === pageHash) continue;
        const cached = _resultCache.get(cachedHash);
        if (!cached) continue;
        if ((Date.now() - cached.storedAt) >= ttlMs) continue;
        if (!cached.fingerprints.length) continue;

        let totalSim = 0;
        let comparisons = 0;
        for (const currentFp of fingerprints) {
          let bestSim = 0;
          for (const cachedFp of cached.fingerprints) {
            try {
              const simResult = calculateSimilarity(currentFp, cachedFp);
              bestSim = Math.max(bestSim, simResult.score);
            } catch {
              // Similarity-Fehler ignorieren
            }
          }
          totalSim += bestSim;
          comparisons++;
        }

        const avgSimilarity = comparisons > 0 ? totalSim / comparisons : 0;
        if (avgSimilarity >= threshold && (!bestMatch || avgSimilarity > bestMatch.similarity)) {
          bestMatch = { similarity: avgSimilarity, result: cached.result };
        }
      }

      if (bestMatch) {
        logger.debug({ similarity: bestMatch.similarity }, "Cache hit (similarity)");
        return {
          hit: true,
          result: bestMatch.result,
          similarity: bestMatch.similarity,
          fingerprints,
          fingerprintHash: pageHash,
        };
      }
    }
  }

  return { hit: false, fingerprints, fingerprintHash: pageHash };
}

/**
 * Speichert ein Analyse-Ergebnis im Cache.
 */
export async function storeInCache(
  result: AnalysisResult,
  fingerprints: SemanticFingerprint[],
  pageHash: string,
  url: string,
  options: FingerprintCacheOptions = {},
): Promise<void> {
  const maxSize = options.maxSize ?? 1000;
  const siteId = parseSiteId(url, options);

  // Result im Cache speichern
  _resultCache.set(pageHash, {
    result,
    storedAt: Date.now(),
    fingerprints,
  });

  // URL-Index aktualisieren
  let urlHashes = _urlIndex.get(url);
  if (!urlHashes) {
    urlHashes = new Set();
    _urlIndex.set(url, urlHashes);
  }
  urlHashes.add(pageHash);

  // Fingerprints im Store speichern (fuer Similarity-Lookup)
  try {
    const { FingerprintStore } = await loadModules();
    if (!_store) {
      _store = new FingerprintStore({ maxSize });
    }
    for (const fp of fingerprints) {
      _store.store(siteId, url, fp);
    }
  } catch (err) {
    logger.debug({ err }, "Failed to store fingerprints in store");
  }

  // maxSize enforcement (aeltesten Eintrag entfernen)
  if (_resultCache.size > maxSize) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, cached] of _resultCache) {
      if (cached.storedAt < oldestTime) {
        oldestTime = cached.storedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      _resultCache.delete(oldestKey);
    }
  }
}

/**
 * Loescht den gesamten Cache (Results + Fingerprints).
 */
export function clearCache(): void {
  _resultCache.clear();
  _urlIndex.clear();
  if (_store) {
    try {
      _store.clear();
    } catch {
      // Ignore clear errors
    }
    _store = undefined;
  }
}

/**
 * Gibt Cache-Statistiken zurueck.
 */
export function cacheStats(): { resultCount: number; fingerprintCount: number } {
  return {
    resultCount: _resultCache.size,
    fingerprintCount: _store ? _store.size() : 0,
  };
}
