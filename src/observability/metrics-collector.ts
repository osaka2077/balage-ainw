import type { MetricsConfig, MetricSnapshot, DashboardData, TimeRange } from "./types.js";
import { MetricsError } from "./errors.js";

interface CounterValue {
  value: number;
}

interface HistogramValue {
  count: number;
  sum: number;
  bucketCounts: Map<number, number>; // bucket upper bound -> count
}

interface GaugeValue {
  value: number;
}

function labelsKey(labels: Record<string, string>): string {
  const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([k, v]) => `${k}="${v}"`).join(",");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

const DEFAULT_CONFIG: MetricsConfig = {
  prefix: "balage",
  defaultLabels: {},
  histogramBuckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
};

export class MetricsCollector {
  private readonly config: MetricsConfig;
  private readonly counters = new Map<string, Map<string, CounterValue>>();
  private readonly histograms = new Map<string, Map<string, HistogramValue>>();
  private readonly gauges = new Map<string, Map<string, GaugeValue>>();
  private readonly metricHelp = new Map<string, string>();

  constructor(config?: Partial<MetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerDefaultMetrics();
  }

  private registerDefaultMetrics(): void {
    // Pre-register BALAGE metrics with help text
    const prefix = this.config.prefix;
    this.metricHelp.set(`${prefix}_workflows_total`, "Total workflows by status");
    this.metricHelp.set(`${prefix}_workflow_duration_seconds`, "Workflow duration in seconds");
    this.metricHelp.set(`${prefix}_steps_total`, "Total steps by status and agent type");
    this.metricHelp.set(`${prefix}_pipeline_duration_seconds`, "Pipeline step duration in seconds");
    this.metricHelp.set(`${prefix}_confidence_score`, "Confidence score distribution");
    this.metricHelp.set(`${prefix}_gate_decisions_total`, "Gate decisions by type");
    this.metricHelp.set(`${prefix}_llm_tokens_total`, "Total LLM tokens by model");
    this.metricHelp.set(`${prefix}_llm_cost_usd_total`, "Total LLM cost in USD by model");
    this.metricHelp.set(`${prefix}_active_workflows`, "Currently active workflows");
    this.metricHelp.set(`${prefix}_active_agents`, "Currently active agents");
    this.metricHelp.set(`${prefix}_errors_total`, "Total errors by code");
    this.metricHelp.set(`${prefix}_endpoint_discoveries_total`, "Total endpoint discoveries");
    this.metricHelp.set(`${prefix}_replay_recordings_total`, "Total replay recordings");
  }

  private fullName(name: string): string {
    if (name.startsWith(this.config.prefix + "_")) return name;
    return `${this.config.prefix}_${name}`;
  }

  private mergeLabels(labels?: Record<string, string>): Record<string, string> {
    return { ...this.config.defaultLabels, ...(labels ?? {}) };
  }

  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const fullName = this.fullName(name);
    const mergedLabels = this.mergeLabels(labels);
    const key = labelsKey(mergedLabels);

    if (!this.counters.has(fullName)) {
      this.counters.set(fullName, new Map());
    }
    const counterMap = this.counters.get(fullName)!;
    const existing = counterMap.get(key);
    if (existing) {
      existing.value += value;
    } else {
      counterMap.set(key, { value });
    }
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = this.fullName(name);
    const mergedLabels = this.mergeLabels(labels);
    const key = labelsKey(mergedLabels);

    if (!this.histograms.has(fullName)) {
      this.histograms.set(fullName, new Map());
    }
    const histMap = this.histograms.get(fullName)!;
    let hist = histMap.get(key);
    if (!hist) {
      const bucketCounts = new Map<number, number>();
      for (const bucket of this.config.histogramBuckets) {
        bucketCounts.set(bucket, 0);
      }
      bucketCounts.set(Infinity, 0);
      hist = { count: 0, sum: 0, bucketCounts };
      histMap.set(key, hist);
    }

    hist.count++;
    hist.sum += value;
    for (const bucket of this.config.histogramBuckets) {
      if (value <= bucket) {
        hist.bucketCounts.set(bucket, (hist.bucketCounts.get(bucket) ?? 0) + 1);
      }
    }
    // +Inf always increments
    hist.bucketCounts.set(Infinity, (hist.bucketCounts.get(Infinity) ?? 0) + 1);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const fullName = this.fullName(name);
    const mergedLabels = this.mergeLabels(labels);
    const key = labelsKey(mergedLabels);

    if (!this.gauges.has(fullName)) {
      this.gauges.set(fullName, new Map());
    }
    this.gauges.get(fullName)!.set(key, { value });
  }

  getMetrics(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, counterMap] of this.counters) {
      const help = this.metricHelp.get(name);
      if (help) lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const [labelStr, counter] of counterMap) {
        const labels = labelStr ? `{${labelStr}}` : "";
        lines.push(`${name}${labels} ${counter.value}`);
      }
    }

    // Histograms
    for (const [name, histMap] of this.histograms) {
      const help = this.metricHelp.get(name);
      if (help) lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [labelStr, hist] of histMap) {
        const labelPrefix = labelStr ? `${labelStr},` : "";
        for (const bucket of this.config.histogramBuckets) {
          const count = hist.bucketCounts.get(bucket) ?? 0;
          lines.push(`${name}_bucket{${labelPrefix}le="${bucket}"} ${count}`);
        }
        lines.push(`${name}_bucket{${labelPrefix}le="+Inf"} ${hist.bucketCounts.get(Infinity) ?? 0}`);
        lines.push(`${name}_sum${labelStr ? `{${labelStr}}` : ""} ${hist.sum}`);
        lines.push(`${name}_count${labelStr ? `{${labelStr}}` : ""} ${hist.count}`);
      }
    }

    // Gauges
    for (const [name, gaugeMap] of this.gauges) {
      const help = this.metricHelp.get(name);
      if (help) lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const [labelStr, gauge] of gaugeMap) {
        const labels = labelStr ? `{${labelStr}}` : "";
        lines.push(`${name}${labels} ${gauge.value}`);
      }
    }

    return lines.join("\n") + "\n";
  }

  getMetricsJSON(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];

    for (const [name, counterMap] of this.counters) {
      snapshots.push({
        name,
        type: "counter",
        help: this.metricHelp.get(name),
        values: Array.from(counterMap.entries()).map(([labelStr, counter]) => ({
          labels: this.parseLabelStr(labelStr),
          value: counter.value,
        })),
      });
    }

    for (const [name, histMap] of this.histograms) {
      snapshots.push({
        name,
        type: "histogram",
        help: this.metricHelp.get(name),
        values: Array.from(histMap.entries()).map(([labelStr, hist]) => {
          const buckets: Record<string, number> = {};
          for (const [bucket, count] of hist.bucketCounts) {
            buckets[bucket === Infinity ? "+Inf" : String(bucket)] = count;
          }
          return {
            labels: this.parseLabelStr(labelStr),
            value: hist.sum / (hist.count || 1),
            buckets,
          };
        }),
      });
    }

    for (const [name, gaugeMap] of this.gauges) {
      snapshots.push({
        name,
        type: "gauge",
        help: this.metricHelp.get(name),
        values: Array.from(gaugeMap.entries()).map(([labelStr, gauge]) => ({
          labels: this.parseLabelStr(labelStr),
          value: gauge.value,
        })),
      });
    }

    return snapshots;
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private parseLabelStr(labelStr: string): Record<string, string> {
    if (!labelStr) return {};
    const labels: Record<string, string> = {};
    const parts = labelStr.split(",");
    for (const part of parts) {
      const match = part.match(/^(.+?)="(.+?)"$/);
      if (match) {
        labels[match[1]!] = match[2]!;
      }
    }
    return labels;
  }
}

/** Dashboard data aggregation utility */
export function getDashboardData(
  collector: MetricsCollector,
  _timeRange?: TimeRange,
): DashboardData {
  const json = collector.getMetricsJSON();

  const findMetric = (name: string) => json.find((m) => m.name === name);

  // Workflows total
  const workflowsMetric = findMetric("balage_workflows_total");
  const totalWorkflows = workflowsMetric
    ? workflowsMetric.values.reduce((sum, v) => sum + v.value, 0)
    : 0;
  const successfulWorkflows = workflowsMetric
    ? workflowsMetric.values
        .filter((v) => v.labels["status"] === "completed")
        .reduce((sum, v) => sum + v.value, 0)
    : 0;

  // Duration
  const durationMetric = findMetric("balage_workflow_duration_seconds");
  const avgDuration = durationMetric?.values[0]?.value ?? 0;

  // Errors
  const errorsMetric = findMetric("balage_errors_total");
  const topErrors = errorsMetric
    ? errorsMetric.values
        .map((v) => ({ code: v.labels["code"] ?? "unknown", count: v.value }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  // Confidence distribution
  const confidenceMetric = findMetric("balage_confidence_score");
  const confidenceBuckets = confidenceMetric?.values[0]?.buckets ?? {};
  const bucketKeys = Object.keys(confidenceBuckets)
    .filter((k) => k !== "+Inf")
    .map(Number)
    .sort((a, b) => a - b);
  const bucketCounts = bucketKeys.map((k) => confidenceBuckets[String(k)] ?? 0);

  // Token usage
  const tokenMetric = findMetric("balage_llm_tokens_total");
  const totalTokens = tokenMetric
    ? tokenMetric.values.reduce((sum, v) => sum + v.value, 0)
    : 0;

  // Active
  const activeWorkflows = findMetric("balage_active_workflows");
  const activeAgents = findMetric("balage_active_agents");

  return {
    workflowsPerHour: totalWorkflows, // simplified — no time bucketing
    averageDurationMs: avgDuration * 1000,
    successRate: totalWorkflows > 0 ? successfulWorkflows / totalWorkflows : 0,
    topErrors,
    confidenceDistribution: { buckets: bucketKeys, counts: bucketCounts },
    tokenUsage: {
      total: totalTokens,
      perWorkflow: totalWorkflows > 0 ? totalTokens / totalWorkflows : 0,
    },
    activeWorkflows: activeWorkflows?.values[0]?.value ?? 0,
    activeAgents: activeAgents?.values[0]?.value ?? 0,
  };
}
