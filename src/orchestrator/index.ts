/**
 * Orchestrator — Public API
 *
 * BALAGE Layer 5: Zentrales Modul das alle Layer zusammenbringt.
 */

// Core
export { WorkflowRunner } from "./workflow-runner.js";
export { Pipeline } from "./pipeline.js";
export { Dispatcher } from "./dispatcher.js";
export { ContextManager } from "./context-manager.js";

// Decomposition + Aggregation
export { decomposeWorkflow, decomposeStep, TaskDecomposer } from "./task-decomposer.js";
export { aggregateResults, detectConflicts, ResultAggregator } from "./result-aggregator.js";

// Typen
export type {
  WorkflowState,
  WorkflowContext,
  WorkflowResult,
  StepResult,
  ResultConflict,
  WorkflowMetrics,
  BudgetTracker,
  ContextHistoryEntry,
  PipelineAction,
  PipelineResult,
  OrchestratorDependencies,
  AgentRegistryInterface,
  PipelineInterface,
  TaskDecomposerInterface,
  ResultAggregatorInterface,
  DispatcherInterface,
  ContextManagerInterface,
  BrowserAdapterInterface,
  ParserInterface,
  SemanticInterface,
  FingerprintInterface,
  ConfidenceInterface,
  RiskGateInterface,
  PipelineDependencies,
} from "./types.js";

// Error-Klassen
export {
  OrchestratorError,
  WorkflowValidationError,
  WorkflowExecutionError,
  TaskDecompositionError,
  DispatchError,
  DispatchTimeoutError,
  ContextOverflowError,
  BudgetExceededError,
  PipelineStepError,
  DAGCycleError,
  ResultAggregationError,
} from "./errors.js";
