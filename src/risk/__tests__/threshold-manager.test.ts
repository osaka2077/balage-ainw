/**
 * ThresholdManager Tests
 */

import { describe, it, expect } from "vitest";
import { ThresholdManager } from "../threshold-manager.js";
import { ThresholdError } from "../errors.js";

describe("ThresholdManager", () => {
  it("returns default thresholds", () => {
    const manager = new ThresholdManager();

    expect(manager.getThreshold("low")).toBe(0.6);
    expect(manager.getThreshold("medium")).toBe(0.75);
    expect(manager.getThreshold("high")).toBe(0.85);
    expect(manager.getThreshold("critical")).toBe(0.95);
  });

  it("enforces absolute minima — cannot go below", () => {
    const manager = new ThresholdManager();

    // LOW minimum is 0.5
    expect(() => manager.setThreshold("low", 0.4)).toThrow(ThresholdError);
    expect(() => manager.setThreshold("low", 0.49)).toThrow(ThresholdError);

    // CRITICAL minimum is 0.90
    expect(() => manager.setThreshold("critical", 0.89)).toThrow(ThresholdError);

    // Valid values should work
    manager.setThreshold("low", 0.5);
    expect(manager.getThreshold("low")).toBe(0.5);

    manager.setThreshold("critical", 0.90);
    expect(manager.getThreshold("critical")).toBe(0.90);
  });

  it("rejects threshold above 1.0", () => {
    const manager = new ThresholdManager();
    expect(() => manager.setThreshold("low", 1.5)).toThrow(ThresholdError);
  });

  it("accepts constructor overrides within minima", () => {
    const manager = new ThresholdManager({ low: 0.55, high: 0.9 });

    expect(manager.getThreshold("low")).toBe(0.55);
    expect(manager.getThreshold("high")).toBe(0.9);
    // Unveränderte Defaults
    expect(manager.getThreshold("medium")).toBe(0.75);
  });
});
