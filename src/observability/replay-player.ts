import type {
  ReplayRecording,
  ReplayEvent,
  ReplayEventType,
  PlaybackOptions,
  PlaybackState,
  ReplayEventHandler,
  ReplayPlaybackResult,
  ReplayDiff,
  ReplayPlayerConfig,
} from "./types.js";
import { ReplayPlaybackError } from "./errors.js";

const DEFAULT_CONFIG: ReplayPlayerConfig = {
  defaultSpeed: 0, // instant
};

export class ReplayPlayer {
  private readonly config: ReplayPlayerConfig;
  private readonly handlers = new Map<ReplayEventType, ReplayEventHandler[]>();
  private state: PlaybackState = "idle";
  private abortController: AbortController | null = null;
  private pauseResolve: (() => void) | null = null;

  constructor(config?: Partial<ReplayPlayerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Liest den aktuellen State ohne TS control-flow narrowing */
  private currentState(): PlaybackState {
    return this.state;
  }

  onEvent(type: ReplayEventType, handler: ReplayEventHandler): void {
    const existing = this.handlers.get(type) ?? [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  async play(
    recording: ReplayRecording,
    options?: Partial<PlaybackOptions>,
  ): Promise<ReplayPlaybackResult> {
    const speed = options?.speed ?? this.config.defaultSpeed;
    const startFrom = options?.startFromEvent ?? 0;
    const stopAt = options?.stopAtEvent ?? recording.events.length;
    const filter = options?.filter;

    this.state = "playing";
    this.abortController = new AbortController();

    let eventsPlayed = 0;
    const playbackStart = Date.now();

    try {
      for (let i = startFrom; i < Math.min(stopAt, recording.events.length); i++) {
        // Pruefe stop/pause Status — currentState() umgeht TS control-flow narrowing,
        // da state extern durch pause()/stop()/resume() mutiert wird
        if (this.currentState() === "stopped") break;
        if (this.currentState() === "paused") {
          await new Promise<void>((resolve) => {
            this.pauseResolve = resolve;
          });
          if (this.currentState() === "stopped") break;
        }

        const event = recording.events[i]!;

        // Filter anwenden
        if (filter && !filter.includes(event.type)) continue;

        // Timing: bei speed > 0 proportional warten
        if (speed > 0 && i > startFrom) {
          const prevEvent = recording.events[i - 1]!;
          const delay = (event.offsetMs - prevEvent.offsetMs) / speed;
          if (delay > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
          }
        }

        // Handler aufrufen
        const handlers = this.handlers.get(event.type) ?? [];
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (err) {
            throw new ReplayPlaybackError(
              i,
              `Handler error at event ${i}: ${err instanceof Error ? err.message : String(err)}`,
              err instanceof Error ? err : undefined,
            );
          }
        }

        eventsPlayed++;
      }

      if (this.currentState() !== "stopped") {
        this.state = "completed";
      }
    } catch (err) {
      this.state = "stopped";
      throw err;
    }

    return {
      recordingId: recording.id,
      eventsPlayed,
      totalEvents: recording.events.length,
      durationMs: Date.now() - playbackStart,
      state: this.state,
    };
  }

  pause(): void {
    if (this.state === "playing") {
      this.state = "paused";
    }
  }

  resume(): void {
    if (this.state === "paused") {
      this.state = "playing";
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
    }
  }

  stop(): void {
    this.state = "stopped";
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    this.abortController?.abort();
  }

  getState(): PlaybackState {
    return this.state;
  }

  async compare(
    recording1: ReplayRecording,
    recording2: ReplayRecording,
  ): Promise<ReplayDiff> {
    const maxLen = Math.max(recording1.events.length, recording2.events.length);
    const added: ReplayEvent[] = [];
    const removed: ReplayEvent[] = [];
    const modified: Array<{
      index: number;
      event1: ReplayEvent;
      event2: ReplayEvent;
      differences: string[];
    }> = [];

    for (let i = 0; i < maxLen; i++) {
      const e1 = recording1.events[i];
      const e2 = recording2.events[i];

      if (e1 && !e2) {
        removed.push(e1);
        continue;
      }
      if (!e1 && e2) {
        added.push(e2);
        continue;
      }
      if (e1 && e2) {
        const diffs: string[] = [];
        if (e1.type !== e2.type) diffs.push(`type: ${e1.type} -> ${e2.type}`);
        if (Math.abs(e1.offsetMs - e2.offsetMs) > 100) {
          diffs.push(`timing: ${e1.offsetMs}ms -> ${e2.offsetMs}ms`);
        }
        if (JSON.stringify(e1.data) !== JSON.stringify(e2.data)) {
          diffs.push("data differs");
        }
        if (diffs.length > 0) {
          modified.push({ index: i, event1: e1, event2: e2, differences: diffs });
        }
      }
    }

    return {
      recording1Id: recording1.id,
      recording2Id: recording2.id,
      added,
      removed,
      modified,
      identical: added.length === 0 && removed.length === 0 && modified.length === 0,
    };
  }
}
