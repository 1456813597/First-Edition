import { z } from "zod";
import { isoDateTimeSchema, symbolIdSchema } from "./common";
import { eventItemSchema, newsItemSchema } from "./market";

export const stanceSchema = z.enum(["bullish", "neutral", "bearish"]);
export const forecastWindowSchema = z.enum(["3d", "10d", "20d"]);
export const dataSufficiencySchema = z.enum(["sufficient", "limited", "insufficient"]);
export const analysisTemplateIdSchema = z.enum(["quick_scan_v1", "technical_swing_v1"]);

export const evidencePointSchema = z.object({
  dimension: z.enum(["technical", "event", "news", "data_quality"]),
  thesis: z.string(),
  featureRefs: z.array(z.string()).min(1)
});

export const analysisResultSchema = z.object({
  schemaVersion: z.literal("analysis.v1"),
  summaryLines: z.array(z.string()).min(3),
  stance: stanceSchema,
  forecastWindow: forecastWindowSchema,
  targetPriceRange: z.object({
    low: z.number().nullable(),
    high: z.number().nullable()
  }),
  targetChangePctRange: z.object({
    low: z.number().nullable(),
    high: z.number().nullable()
  }),
  confidence: z.object({
    score: z.number().int().min(0).max(100),
    rationale: z.string()
  }),
  dataSufficiency: dataSufficiencySchema,
  evidence: z.array(evidencePointSchema),
  risks: z.array(z.string()),
  invalidationSignals: z.array(z.string()).min(1),
  actionPlan: z.object({
    observationLevels: z.array(z.number()),
    stopLossIdea: z.string(),
    takeProfitIdea: z.string(),
    disclaimer: z.literal("仅供研究参考，不构成投资建议")
  })
});

export const featureValueSchema = z.object({
  featureRef: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()])
});

export const featurePackSchema = z.object({
  symbol: symbolIdSchema,
  generatedAt: isoDateTimeSchema,
  marketSummary: z.array(z.string()),
  technicalFeatures: z.array(featureValueSchema),
  eventDigest: z.array(eventItemSchema),
  newsDigest: z.array(newsItemSchema),
  dataQualityFlags: z.array(z.string())
});

export const analysisRunInputSchema = z.object({
  symbol: symbolIdSchema,
  templateId: analysisTemplateIdSchema,
  forecastWindow: forecastWindowSchema,
  llmProfileId: z.string().min(1)
});

export const analysisRunSummarySchema = z.object({
  id: z.string(),
  symbol: symbolIdSchema,
  templateId: analysisTemplateIdSchema,
  stance: stanceSchema,
  confidenceScore: z.number().int().min(0).max(100),
  forecastWindow: forecastWindowSchema,
  createdAt: isoDateTimeSchema,
  summary: z.string()
});

export const analysisRunSchema = analysisRunSummarySchema.extend({
  result: analysisResultSchema,
  featurePack: featurePackSchema
});

export const analysisRunDetailSchema = analysisRunSchema.extend({
  rawResponse: z.string(),
  promptRequest: z.string(),
  validationReport: z.string()
});

export const analysisExportFormatSchema = z.enum(["markdown", "pdf"]);

export const analysisExportResultSchema = z.object({
  path: z.string().min(1),
  format: analysisExportFormatSchema,
  exportedCount: z.number().int().min(0)
});

export const analysisQueueItemSchema = z.object({
  id: z.string(),
  symbol: symbolIdSchema,
  templateId: analysisTemplateIdSchema,
  forecastWindow: forecastWindowSchema,
  enqueuedAt: isoDateTimeSchema
});

export const analysisQueueStatusSchema = z.object({
  running: analysisQueueItemSchema.nullable(),
  pending: z.array(analysisQueueItemSchema),
  totalPending: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});
