import { z } from "zod";

// ============================================================================
// DOM & Accessibility — Layer 2 Basis-Typen
// ============================================================================

/** Bounding-Box eines DOM-Elements in Pixeln */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/** Strukturierter DOM-Knoten — Minimale Repraesentation fuer Parsing */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DomNodeSchema: z.ZodType<DomNode, z.ZodTypeDef, any> = z.lazy(() =>
  z.object({
    tagName: z.string().min(1).max(64),
    attributes: z.record(z.string()),
    textContent: z.string().max(4096).optional(),
    isVisible: z.boolean(),
    isInteractive: z.boolean(),
    boundingBox: BoundingBoxSchema.optional(),
    computedStyles: z
      .object({
        display: z.string(),
        visibility: z.string(),
        opacity: z.number().min(0).max(1),
      })
      .optional(),
    domPath: z.string().max(2048).optional(),
    children: z.array(DomNodeSchema).default([]),
  })
);

export interface DomNode {
  tagName: string;
  attributes: Record<string, string>;
  textContent?: string;
  isVisible: boolean;
  isInteractive: boolean;
  boundingBox?: BoundingBox;
  computedStyles?: {
    display: string;
    visibility: string;
    opacity: number;
  };
  domPath?: string;
  children: DomNode[];
}

/** Accessibility-Tree-Knoten — ARIA-Informationen */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AccessibilityNodeSchema: z.ZodType<AccessibilityNode, z.ZodTypeDef, any> = z.lazy(
  () =>
    z.object({
      role: z.string().min(1).max(64),
      name: z.string().max(512).default(""),
      value: z.string().max(2048).optional(),
      description: z.string().max(1024).optional(),
      checked: z
        .enum(["true", "false", "mixed"])
        .optional(),
      disabled: z.boolean().default(false),
      required: z.boolean().default(false),
      expanded: z.boolean().optional(),
      selected: z.boolean().optional(),
      level: z.number().int().positive().optional(),
      boundingBox: BoundingBoxSchema.optional(),
      children: z.array(AccessibilityNodeSchema).default([]),
    })
);

export interface AccessibilityNode {
  role: string;
  name: string;
  value?: string;
  description?: string;
  checked?: "true" | "false" | "mixed";
  disabled: boolean;
  required: boolean;
  expanded?: boolean;
  selected?: boolean;
  level?: number;
  boundingBox?: BoundingBox;
  children: AccessibilityNode[];
}
