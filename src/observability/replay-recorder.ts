import { randomUUID } from "node:crypto";
import type {
  ReplayConfig,
  ReplayEvent,
  ReplayEventType,
  ReplayRecording,
  RecordingSummary,
} from "./types.js";
import type { WorkflowDefinition } from "../../shared_interfaces.js";
import { PiiFilter } from "./pii-filter.js";
import { ReplayError, ReplayRecordingNotFoundError } from "./errors.js";

const DEFAULT_CONFIG: ReplayConfig = {
  maxRecordingSize: 10 * 1024 * 1024, // 10MB
  maxEvents: 50000,
  piiFilter: true,
};

interface ActiveRecording {
  id: string;
  workflowId: string;
  traceId: string;
  events: ReplayEvent[];
  startTime: number;
  workflow?: WorkflowDefinition;
  startContext: Record<string, unknown>;
}

export class ReplayRecorder {
  private readonly config: ReplayConfig;
  private readonly piiFilter: PiiFilter | null;
  private readonly activeRecordings = new Map<string, ActiveRecording>();
  private readonly completedRecordings = new Map<string, ReplayRecording>();

  constructor(config?: Partial<ReplayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.piiFilter = this.config.piiFilter ? new PiiFilter() : null;
  }

  startRecording(
    workflowId: string,
    traceId: string,
    options?: { workflow?: WorkflowDefinition; startContext?: Record<string, unknown> },
  ): string {
    const id = randomUUID();
    const recording: ActiveRecording = {
      id,
      workflowId,
      traceId,
      events: [],
      startTime: Date.now(),
      workflow: options?.workflow,
      startContext: options?.startContext ?? {},
    };
    this.activeRecordings.set(id, recording);
    return id;
  }

  recordEvent(recordingId: string, event: Omit<ReplayEvent, "offsetMs"> & { offsetMs?: number }): void {
    const recording = this.activeRecordings.get(recordingId);
    if (!recording) {
      throw new ReplayRecordingNotFoundError(recordingId);
    }

    if (recording.events.length >= this.config.maxEvents) {
      throw new ReplayError(
        `Max events (${this.config.maxEvents}) reached for recording ${recordingId}`,
        "MAX_EVENTS_REACHED",
      );
    }

    // Calculate offset from recording start
    const offsetMs = event.offsetMs ?? (Date.now() - recording.startTime);

    let data = event.data;
    if (this.piiFilter) {
      data = this.piiFilter.filterObject(data);
    }

    const replayEvent: ReplayEvent = {
      offsetMs,
      type: event.type,
      data,
      traceId: event.traceId,
      spanId: event.spanId,
    };

    recording.events.push(replayEvent);
  }

  stopRecording(recordingId: string): ReplayRecording {
    const recording = this.activeRecordings.get(recordingId);
    if (!recording) {
      throw new ReplayRecordingNotFoundError(recordingId);
    }

    this.activeRecordings.delete(recordingId);

    const totalDurationMs = recording.events.length > 0
      ? recording.events[recording.events.length - 1]!.offsetMs
      : 0;

    // Verwende uebergebene WorkflowDefinition oder minimalen Platzhalter
    const workflow: WorkflowDefinition = recording.workflow ?? {
      name: "unknown",
      startUrl: "https://unknown",
      steps: [{
        id: "unknown",
        name: "unknown",
        agentType: "navigator",
        task: {
          objective: "unknown",
          acceptanceCriteria: ["unknown"],
        },
      }],
    } as WorkflowDefinition;

    const completed: ReplayRecording = {
      id: recording.id,
      workflowId: recording.workflowId,
      traceId: recording.traceId,
      events: recording.events,
      workflow,
      startContext: recording.startContext,
      totalDurationMs,
      eventCount: recording.events.length,
      createdAt: new Date(),
    };

    this.completedRecordings.set(recording.id, completed);
    return completed;
  }

  getRecording(recordingId: string): ReplayRecording | null {
    return this.completedRecordings.get(recordingId) ?? null;
  }

  listRecordings(): RecordingSummary[] {
    return Array.from(this.completedRecordings.values()).map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      traceId: r.traceId,
      eventCount: r.eventCount,
      totalDurationMs: r.totalDurationMs,
      createdAt: r.createdAt,
    }));
  }

  deleteRecording(recordingId: string): boolean {
    return this.completedRecordings.delete(recordingId);
  }
}
