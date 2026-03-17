/**
 * Orchestrator — Context Manager
 *
 * Globaler Kontext fuer den Workflow. Shared State zwischen allen Steps.
 * Thread-safe, mit automatischem Pruning bei Ueberschreitung.
 */

import pino from "pino";
import type { AgentResult, Endpoint, StateChangeEvent } from "../../shared_interfaces.js";
import type {
  WorkflowContext,
  WorkflowState,
  ContextHistoryEntry,
  BudgetTracker,
  ContextManagerInterface,
} from "./types.js";
import { ContextOverflowError } from "./errors.js";

const logger = pino({ name: "orchestrator:context-manager" });

const MAX_CONTEXT_BYTES = 100 * 1024; // 100KB
const MAX_STATE_CHANGES = 50;
const MAX_HISTORY_ENTRIES = 100;

export class ContextManager implements ContextManagerInterface {
  private context: WorkflowContext;
  private lock = false;

  constructor(initialContext: Partial<WorkflowContext>) {
    this.context = {
      workflowId: initialContext.workflowId ?? "",
      traceId: initialContext.traceId ?? "",
      startUrl: initialContext.startUrl ?? "",
      currentUrl: initialContext.currentUrl,
      state: initialContext.state ?? "pending",
      variables: initialContext.variables ?? {},
      discoveredEndpoints: initialContext.discoveredEndpoints ?? [],
      stateChanges: initialContext.stateChanges ?? [],
      history: initialContext.history ?? [],
      budget: initialContext.budget ?? {
        maxTokens: 100_000,
        usedTokens: 0,
        maxCostUsd: 1.0,
        usedCostUsd: 0,
        maxDurationMs: 300_000,
        elapsedMs: 0,
        isExceeded: false,
      },
      startedAt: initialContext.startedAt ?? new Date(),
      settings: initialContext.settings ?? {
        maxTotalDuration: 300_000,
        maxTotalBudget: 1.0,
        continueOnStepFailure: false,
        parallelExecution: true,
        requireAllStepsSuccess: true,
      },
    };
  }

  get(key: string): unknown {
    return this.context.variables[key];
  }

  set(key: string, value: unknown): void {
    this.context.variables[key] = value;
    this.checkSizeAndPrune();
  }

  getSnapshot(): WorkflowContext {
    return structuredClone(this.context);
  }

  applyResult(
    taskId: string,
    result: AgentResult,
    outputMapping: Record<string, string>,
  ): void {
    this.acquireLock();
    try {
      // outputMapping anwenden: Ergebnis-Felder in Context-Keys mappen
      for (const [outputKey, contextKey] of Object.entries(outputMapping)) {
        const value = result.output[outputKey];
        if (value !== undefined) {
          this.context.variables[contextKey] = value;
        }
      }

      // Discovered Endpoints einfuegen (dedupliziert)
      if (result.endpointsDiscovered.length > 0) {
        const existingIds = new Set(
          this.context.discoveredEndpoints.map((e: Endpoint) => e.id),
        );
        // Endpoint-IDs aus dem Result speichern (Details kommen spaeter)
        for (const endpointId of result.endpointsDiscovered) {
          if (!existingIds.has(endpointId)) {
            existingIds.add(endpointId);
          }
        }
      }

      // State Changes in History
      for (const sc of result.stateChanges) {
        this.context.stateChanges.push(sc);
      }

      // Budget aktualisieren
      this.context.budget.usedTokens += result.llmTokensUsed;
      this.context.budget.usedCostUsd += result.llmCost;
      this.context.budget.isExceeded =
        this.context.budget.usedTokens > this.context.budget.maxTokens ||
        this.context.budget.usedCostUsd > this.context.budget.maxCostUsd;

      // History-Eintrag
      this.addHistory({
        timestamp: new Date(),
        type: "result_received",
        taskId,
        details: {
          success: result.success,
          duration: result.duration,
          actionsPerformed: result.actionsPerformed,
        },
      });

      this.checkSizeAndPrune();

      logger.debug(
        { taskId, budgetUsed: this.context.budget.usedTokens },
        "Result applied to context",
      );
    } finally {
      this.releaseLock();
    }
  }

  prune(): void {
    // State Changes: nur letzte N behalten
    if (this.context.stateChanges.length > MAX_STATE_CHANGES) {
      this.context.stateChanges = this.context.stateChanges.slice(
        -MAX_STATE_CHANGES,
      );
    }

    // History begrenzen
    if (this.context.history.length > MAX_HISTORY_ENTRIES) {
      this.context.history = this.context.history.slice(-MAX_HISTORY_ENTRIES);
    }

    // Grosse variable-Werte kuerzen (DOM-Snapshots etc.)
    for (const [key, value] of Object.entries(this.context.variables)) {
      if (typeof value === "string" && value.length > 10_000) {
        this.context.variables[key] = value.slice(0, 10_000) + "...[pruned]";
      }
    }

    logger.debug("Context pruned");
  }

  getHistory(): ContextHistoryEntry[] {
    return [...this.context.history];
  }

  addHistory(entry: ContextHistoryEntry): void {
    this.context.history.push(entry);
    if (this.context.history.length > MAX_HISTORY_ENTRIES) {
      this.context.history = this.context.history.slice(-MAX_HISTORY_ENTRIES);
    }
  }

  updateState(state: WorkflowState): void {
    this.context.state = state;
  }

  updateBudget(tokens: number, cost: number, elapsedMs: number): void {
    this.context.budget.usedTokens += tokens;
    this.context.budget.usedCostUsd += cost;
    this.context.budget.elapsedMs = elapsedMs;
    this.context.budget.isExceeded =
      this.context.budget.usedTokens > this.context.budget.maxTokens ||
      this.context.budget.usedCostUsd > this.context.budget.maxCostUsd ||
      this.context.budget.elapsedMs > this.context.budget.maxDurationMs;
  }

  isBudgetExceeded(): boolean {
    return this.context.budget.isExceeded;
  }

  /** Kontextgroesse pruefen und bei Bedarf prunen */
  private checkSizeAndPrune(): void {
    const size = this.estimateSize();
    if (size > MAX_CONTEXT_BYTES) {
      logger.warn(
        { currentSize: size, maxSize: MAX_CONTEXT_BYTES },
        "Context exceeds size limit, pruning",
      );
      this.prune();

      const sizeAfter = this.estimateSize();
      if (sizeAfter > MAX_CONTEXT_BYTES) {
        throw new ContextOverflowError(sizeAfter, MAX_CONTEXT_BYTES);
      }
    }
  }

  /** Groesse des Context schaetzen */
  private estimateSize(): number {
    return new TextEncoder().encode(JSON.stringify(this.context)).byteLength;
  }

  /** Einfacher Mutex fuer concurrent-safety */
  private acquireLock(): void {
    if (this.lock) {
      logger.warn("Context lock contention detected");
    }
    this.lock = true;
  }

  private releaseLock(): void {
    this.lock = false;
  }
}
