import { z } from "zod";
import { BoundingBoxSchema, DomNodeSchema } from "./dom.js";

// ============================================================================
// UI Segmentation — Erkannte UI-Bereiche
// ============================================================================

/** Typ eines UI-Segments */
export const UISegmentTypeSchema = z.enum([
  "form",
  "navigation",
  "content",
  "header",
  "footer",
  "sidebar",
  "modal",
  "overlay",
  "banner",
  "table",
  "list",
  "media",
  "search",
  "checkout",
  "unknown",
]);
export type UISegmentType = z.infer<typeof UISegmentTypeSchema>;

/** Segmentiertes UI-Fragment */
export const UISegmentSchema = z.object({
  id: z.string().uuid(),
  type: UISegmentTypeSchema,
  label: z.string().max(256).optional(),
  confidence: z.number().min(0).max(1),
  boundingBox: BoundingBoxSchema,
  nodes: z.array(DomNodeSchema).min(1),
  interactiveElementCount: z.number().int().nonnegative(),
  semanticRole: z.string().max(128).optional(),
  parentSegmentId: z.string().uuid().optional(),
});
export type UISegment = z.infer<typeof UISegmentSchema>;
