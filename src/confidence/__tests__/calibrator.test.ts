/**
 * Calibrator Tests — Platt Scaling
 */

import { describe, it, expect } from "vitest";
import { calibrate, applyCalibration, evaluateCalibration } from "../calibrator.js";
import type { CalibrationDataPoint } from "../types.js";

/** Generiert synthetische Kalibrierungsdaten */
function generateCalibrationData(n: number): CalibrationDataPoint[] {
  const data: CalibrationDataPoint[] = [];
  for (let i = 0; i < n; i++) {
    const predicted = i / n;
    // Gut kalibriert: hohe Vorhersage → meist Erfolg
    const actual = Math.random() < predicted;
    data.push({ predicted, actual });
  }
  return data;
}

describe("Calibrator", () => {
  describe("calibrate", () => {
    it("Kalibrierung mit 100 Datenpunkten liefert gueltige Params", () => {
      const data = generateCalibrationData(100);
      const params = calibrate(data);

      expect(params).not.toBeNull();
      expect(params!.a).toBeDefined();
      expect(params!.b).toBeDefined();
      expect(params!.dataPoints).toBe(100);
      expect(params!.brierScore).toBeGreaterThanOrEqual(0);
      expect(params!.brierScore).toBeLessThanOrEqual(1);
      expect(params!.createdAt).toBeInstanceOf(Date);
    });

    it("weniger als 50 Datenpunkte — gibt null zurueck", () => {
      const data = generateCalibrationData(30);
      const params = calibrate(data);
      expect(params).toBeNull();
    });

    it("exakt 50 Datenpunkte — funktioniert", () => {
      const data = generateCalibrationData(50);
      const params = calibrate(data);
      expect(params).not.toBeNull();
    });
  });

  describe("applyCalibration", () => {
    it("null params — Raw-Score wird durchgereicht", () => {
      expect(applyCalibration(0.7, null)).toBeCloseTo(0.7, 4);
      expect(applyCalibration(0.3, null)).toBeCloseTo(0.3, 4);
    });

    it("kalibrierter Score bleibt zwischen 0.0 und 1.0", () => {
      const data = generateCalibrationData(100);
      const params = calibrate(data)!;

      for (let raw = 0; raw <= 1; raw += 0.1) {
        const calibrated = applyCalibration(raw, params);
        expect(calibrated).toBeGreaterThanOrEqual(0.0);
        expect(calibrated).toBeLessThanOrEqual(1.0);
      }
    });

    it("Raw-Score wird geclamped bei null params", () => {
      expect(applyCalibration(-0.5, null)).toBe(0.0);
      expect(applyCalibration(1.5, null)).toBe(1.0);
    });
  });

  describe("evaluateCalibration", () => {
    it("Evaluation liefert Brier Score und ECE", () => {
      const trainData = generateCalibrationData(100);
      const params = calibrate(trainData)!;
      const testData = generateCalibrationData(50);

      const metrics = evaluateCalibration(params, testData);

      expect(metrics.brierScore).toBeGreaterThanOrEqual(0);
      expect(metrics.brierScore).toBeLessThanOrEqual(1);
      expect(metrics.ece).toBeGreaterThanOrEqual(0);
      expect(metrics.binCount).toBe(10);
      expect(typeof metrics.isWellCalibrated).toBe("boolean");
    });
  });
});
