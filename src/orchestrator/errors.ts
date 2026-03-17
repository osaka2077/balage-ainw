/**
 * Orchestrator — Error-Klassen
 */

export class OrchestratorError extends Error {
  readonly code: string;
  override readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = "OrchestratorError";
    this.code = code;
    this.cause = cause;
  }
}

export class WorkflowValidationError extends OrchestratorError {
  constructor(message: string, cause?: Error) {
    super(message, "WORKFLOW_VALIDATION_ERROR", cause);
    this.name = "WorkflowValidationError";
  }
}

export class WorkflowExecutionError extends OrchestratorError {
  readonly stepId?: string;

  constructor(message: string, stepId?: string, cause?: Error) {
    super(message, "WORKFLOW_EXECUTION_ERROR", cause);
    this.name = "WorkflowExecutionError";
    this.stepId = stepId;
  }
}

export class TaskDecompositionError extends OrchestratorError {
  readonly stepId: string;

  constructor(message: string, stepId: string, cause?: Error) {
    super(message, "TASK_DECOMPOSITION_ERROR", cause);
    this.name = "TaskDecompositionError";
    this.stepId = stepId;
  }
}

export class DispatchError extends OrchestratorError {
  readonly taskId: string;
  readonly agentType: string;

  constructor(
    message: string,
    taskId: string,
    agentType: string,
    cause?: Error,
  ) {
    super(message, "DISPATCH_ERROR", cause);
    this.name = "DispatchError";
    this.taskId = taskId;
    this.agentType = agentType;
  }
}

export class DispatchTimeoutError extends DispatchError {
  readonly timeout: number;

  constructor(taskId: string, agentType: string, timeout: number) {
    super(
      `Agent ${agentType} timed out after ${timeout}ms for task ${taskId}`,
      taskId,
      agentType,
    );
    this.name = "DispatchTimeoutError";
    (this as { code: string }).code = "DISPATCH_TIMEOUT";
    this.timeout = timeout;
  }
}

export class ContextOverflowError extends OrchestratorError {
  readonly currentSize: number;
  readonly maxSize: number;

  constructor(currentSize: number, maxSize: number) {
    super(
      `Context overflow: ${currentSize} bytes exceeds limit of ${maxSize} bytes`,
      "CONTEXT_OVERFLOW",
    );
    this.name = "ContextOverflowError";
    this.currentSize = currentSize;
    this.maxSize = maxSize;
  }
}

export class BudgetExceededError extends OrchestratorError {
  readonly budgetType: string;
  readonly limit: number;
  readonly used: number;

  constructor(budgetType: string, limit: number, used: number) {
    super(
      `Budget exceeded: ${budgetType} used ${used} of ${limit}`,
      "BUDGET_EXCEEDED",
    );
    this.name = "BudgetExceededError";
    this.budgetType = budgetType;
    this.limit = limit;
    this.used = used;
  }
}

export class PipelineStepError extends OrchestratorError {
  readonly step: string;

  constructor(message: string, step: string, cause?: Error) {
    super(message, "PIPELINE_STEP_ERROR", cause);
    this.name = "PipelineStepError";
    this.step = step;
  }
}

export class DAGCycleError extends OrchestratorError {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(
      `DAG cycle detected: ${cycle.join(" -> ")}`,
      "DAG_CYCLE",
    );
    this.name = "DAGCycleError";
    this.cycle = cycle;
  }
}

export class ResultAggregationError extends OrchestratorError {
  constructor(message: string, cause?: Error) {
    super(message, "RESULT_AGGREGATION_ERROR", cause);
    this.name = "ResultAggregationError";
  }
}
