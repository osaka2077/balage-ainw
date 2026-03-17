import pino from "pino";
import type { LogLevel, LoggerOptions } from "./types.js";
import { PiiFilter } from "./pii-filter.js";

const PINO_LEVEL_MAP: Record<LogLevel, string> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal",
};

export class BalageLogger {
  private readonly pinoLogger: pino.Logger;
  private readonly piiFilter: PiiFilter | null;
  private readonly enrichTraceContext: boolean;
  private traceContextGetter?: () => { traceId?: string; spanId?: string } | undefined;

  constructor(
    pinoInstance: pino.Logger,
    piiFilter: PiiFilter | null,
    enrichTraceContext: boolean,
  ) {
    this.pinoLogger = pinoInstance;
    this.piiFilter = piiFilter;
    this.enrichTraceContext = enrichTraceContext;
  }

  setTraceContextGetter(getter: () => { traceId?: string; spanId?: string } | undefined): void {
    this.traceContextGetter = getter;
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.log("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.log("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.log("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.log("error", msg, data);
  }

  fatal(msg: string, data?: Record<string, unknown>): void {
    this.log("fatal", msg, data);
  }

  child(bindings: Record<string, unknown>): BalageLogger {
    const filteredBindings = this.piiFilter
      ? this.piiFilter.filterObject(bindings)
      : bindings;
    const childPino = this.pinoLogger.child(filteredBindings);
    const childLogger = new BalageLogger(childPino, this.piiFilter, this.enrichTraceContext);
    childLogger.traceContextGetter = this.traceContextGetter;
    return childLogger;
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    // Apply PII filter
    const filteredMsg = this.piiFilter ? this.piiFilter.filterString(msg) : msg;
    const filteredData = data && this.piiFilter
      ? this.piiFilter.filterObject(data)
      : data;

    // Build merged object with optional trace context
    const merged: Record<string, unknown> = { ...filteredData };
    if (this.enrichTraceContext && this.traceContextGetter) {
      const ctx = this.traceContextGetter();
      if (ctx) {
        if (ctx.traceId) merged["traceId"] = ctx.traceId;
        if (ctx.spanId) merged["spanId"] = ctx.spanId;
      }
    }

    const pinoLevel = PINO_LEVEL_MAP[level];
    if (Object.keys(merged).length > 0) {
      (this.pinoLogger[pinoLevel as keyof pino.Logger] as Function)(merged, filteredMsg);
    } else {
      (this.pinoLogger[pinoLevel as keyof pino.Logger] as Function)(filteredMsg);
    }
  }

  /** Access the underlying pino instance (for testing) */
  getPinoLogger(): pino.Logger {
    return this.pinoLogger;
  }
}

export function createLogger(options: Partial<LoggerOptions> & { name: string }): BalageLogger {
  const opts: LoggerOptions = {
    name: options.name,
    level: options.level ?? "info",
    piiFilter: options.piiFilter ?? true,
    traceContext: options.traceContext ?? true,
    destination: options.destination ?? "stdout",
  };

  const pinoOpts: pino.LoggerOptions = {
    name: opts.name,
    level: opts.level,
  };

  let pinoInstance: pino.Logger;
  if (opts.destination && opts.destination !== "stdout") {
    pinoInstance = pino(pinoOpts, pino.destination(opts.destination));
  } else {
    pinoInstance = pino(pinoOpts);
  }

  const filter = opts.piiFilter ? new PiiFilter() : null;
  return new BalageLogger(pinoInstance, filter, opts.traceContext);
}
