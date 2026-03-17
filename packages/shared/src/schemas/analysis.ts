import { z } from "zod";
import { isoDateTimeSchema, symbolIdSchema } from "./common";
import { eventItemSchema, newsItemSchema } from "./market";
import { llmProtocolSchema } from "./settings";

export const stanceSchema = z.enum(["bullish", "neutral", "bearish"]);
export const forecastWindowSchema = z.enum(["3d", "10d", "20d"]);
export const dataSufficiencySchema = z.enum(["sufficient", "limited", "insufficient"]);
export const analysisTemplateIdSchema = z.enum(["quick_scan_v1", "technical_swing_v1"]);
export const analysisWorkflowIdSchema = z.enum(["stock_research_v1"]);
export const analysisTaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export const analysisStageStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export const analysisActorKindSchema = z.enum(["host", "llm"]);
export const analysisStageKeySchema = z.enum([
  "snapshot_collect",
  "research_plan",
  "evidence_expand",
  "technical_analysis",
  "fundamental_event_analysis",
  "risk_challenge",
  "final_report",
  "validate_and_persist"
]);

export const evidencePointSchema = z.object({
  dimension: z.enum(["technical", "event", "news", "data_quality"]),
  thesis: z.string(),
  featureRefs: z.array(z.string()).min(1)
});

export const legacyAnalysisResultSchema = z.object({
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

export const researchPlanSchema = z.object({
  schemaVersion: z.literal("analysis.stage.research_plan.v1"),
  focusAreas: z.array(z.string()).min(1),
  keyQuestions: z.array(z.string()).min(1),
  evidencePriorities: z.array(z.string()).min(1),
  dataGaps: z.array(z.string()),
  recommendedExpansions: z.array(z.string())
});

export const researchPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "focusAreas", "keyQuestions", "evidencePriorities", "dataGaps", "recommendedExpansions"],
  properties: {
    schemaVersion: { const: "analysis.stage.research_plan.v1" },
    focusAreas: { type: "array", minItems: 1, items: { type: "string" } },
    keyQuestions: { type: "array", minItems: 1, items: { type: "string" } },
    evidencePriorities: { type: "array", minItems: 1, items: { type: "string" } },
    dataGaps: { type: "array", items: { type: "string" } },
    recommendedExpansions: { type: "array", items: { type: "string" } }
  }
} as const;

export const technicalStageResultSchema = z.object({
  schemaVersion: z.literal("analysis.stage.technical.v1"),
  stanceHint: stanceSchema,
  summary: z.string(),
  trendAssessment: z.string(),
  momentumAssessment: z.string(),
  supportLevels: z.array(z.number()),
  resistanceLevels: z.array(z.number()),
  evidence: z.array(z.string()).min(1)
});

export const technicalStageResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "stanceHint", "summary", "trendAssessment", "momentumAssessment", "supportLevels", "resistanceLevels", "evidence"],
  properties: {
    schemaVersion: { const: "analysis.stage.technical.v1" },
    stanceHint: { type: "string", enum: ["bullish", "neutral", "bearish"] },
    summary: { type: "string" },
    trendAssessment: { type: "string" },
    momentumAssessment: { type: "string" },
    supportLevels: { type: "array", items: { type: "number" } },
    resistanceLevels: { type: "array", items: { type: "number" } },
    evidence: { type: "array", minItems: 1, items: { type: "string" } }
  }
} as const;

export const fundamentalEventStageResultSchema = z.object({
  schemaVersion: z.literal("analysis.stage.fundamental_event.v1"),
  stanceHint: stanceSchema,
  summary: z.string(),
  fundamentalAssessment: z.string(),
  newsAssessment: z.string(),
  linkageAssessment: z.string(),
  evidence: z.array(z.string()).min(1)
});

export const fundamentalEventStageResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "stanceHint", "summary", "fundamentalAssessment", "newsAssessment", "linkageAssessment", "evidence"],
  properties: {
    schemaVersion: { const: "analysis.stage.fundamental_event.v1" },
    stanceHint: { type: "string", enum: ["bullish", "neutral", "bearish"] },
    summary: { type: "string" },
    fundamentalAssessment: { type: "string" },
    newsAssessment: { type: "string" },
    linkageAssessment: { type: "string" },
    evidence: { type: "array", minItems: 1, items: { type: "string" } }
  }
} as const;

export const riskChallengeStageResultSchema = z.object({
  schemaVersion: z.literal("analysis.stage.risk_challenge.v1"),
  summary: z.string(),
  confidenceAdjustment: z.number().int().min(-100).max(100),
  risks: z.array(z.string()).min(1),
  invalidationSignals: z.array(z.string()).min(1),
  opposingEvidence: z.array(z.string()).min(1)
});

export const riskChallengeStageResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "summary", "confidenceAdjustment", "risks", "invalidationSignals", "opposingEvidence"],
  properties: {
    schemaVersion: { const: "analysis.stage.risk_challenge.v1" },
    summary: { type: "string" },
    confidenceAdjustment: { type: "integer", minimum: -100, maximum: 100 },
    risks: { type: "array", minItems: 1, items: { type: "string" } },
    invalidationSignals: { type: "array", minItems: 1, items: { type: "string" } },
    opposingEvidence: { type: "array", minItems: 1, items: { type: "string" } }
  }
} as const;

export const reportSectionSchema = z.object({
  summary: z.string(),
  bullets: z.array(z.string()).min(1)
});

export const scenarioBranchSchema = z.object({
  thesis: z.string(),
  probabilityLabel: z.string(),
  triggerSignals: z.array(z.string()).min(1),
  targetChangePctRange: z.object({
    low: z.number().nullable(),
    high: z.number().nullable()
  })
});

export const riskMatrixItemSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  title: z.string(),
  detail: z.string(),
  mitigation: z.string()
});

export const sectorIndexLinkageViewSchema = z.object({
  industry: z.string().nullable(),
  conceptBoards: z.array(z.string()),
  indexSnapshot: z.array(z.string()),
  interpretation: z.string()
});

export const analysisReportV2Schema = z.object({
  schemaVersion: z.literal("analysis_report_v2"),
  symbol: symbolIdSchema,
  asOf: isoDateTimeSchema,
  forecastWindow: forecastWindowSchema,
  marketRegime: reportSectionSchema,
  stance: stanceSchema,
  confidence: z.object({
    score: z.number().int().min(0).max(100),
    rationale: z.string()
  }),
  summary: z.array(z.string()).min(3),
  technicalView: reportSectionSchema,
  fundamentalView: reportSectionSchema,
  newsEventView: reportSectionSchema,
  sectorIndexLinkage: sectorIndexLinkageViewSchema,
  scenarioTree: z.object({
    bull: scenarioBranchSchema,
    base: scenarioBranchSchema,
    bear: scenarioBranchSchema
  }),
  riskMatrix: z.array(riskMatrixItemSchema).min(1),
  invalidationSignals: z.array(z.string()).min(1),
  actionPlan: z.object({
    observationLevels: z.array(z.number()),
    entryIdea: z.string(),
    stopLossIdea: z.string(),
    takeProfitIdea: z.string(),
    positionSizingIdea: z.string(),
    disclaimer: z.literal("仅供研究参考，不构成投资建议")
  }),
  evidence: z.array(
    z.object({
      id: z.string(),
      dimension: z.enum(["technical", "fundamental", "news_event", "sector_index", "data_quality"]),
      thesis: z.string(),
      refs: z.array(z.string()).min(1)
    })
  ).min(1),
  dataQuality: z.object({
    sufficiency: dataSufficiencySchema,
    flags: z.array(z.string()),
    missingPieces: z.array(z.string())
  }),
  disclaimer: z.literal("仅供研究参考，不构成投资建议")
});

export const analysisResultSchema = analysisReportV2Schema;

export const analysisReportV2JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "symbol",
    "asOf",
    "forecastWindow",
    "marketRegime",
    "stance",
    "confidence",
    "summary",
    "technicalView",
    "fundamentalView",
    "newsEventView",
    "sectorIndexLinkage",
    "scenarioTree",
    "riskMatrix",
    "invalidationSignals",
    "actionPlan",
    "evidence",
    "dataQuality",
    "disclaimer"
  ],
  properties: {
    schemaVersion: { const: "analysis_report_v2" },
    symbol: { type: "string" },
    asOf: { type: "string" },
    forecastWindow: { type: "string", enum: ["3d", "10d", "20d"] },
    marketRegime: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "bullets"],
      properties: {
        summary: { type: "string" },
        bullets: { type: "array", minItems: 1, items: { type: "string" } }
      }
    },
    stance: { type: "string", enum: ["bullish", "neutral", "bearish"] },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["score", "rationale"],
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        rationale: { type: "string" }
      }
    },
    summary: { type: "array", minItems: 3, items: { type: "string" } },
    technicalView: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "bullets"],
      properties: {
        summary: { type: "string" },
        bullets: { type: "array", minItems: 1, items: { type: "string" } }
      }
    },
    fundamentalView: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "bullets"],
      properties: {
        summary: { type: "string" },
        bullets: { type: "array", minItems: 1, items: { type: "string" } }
      }
    },
    newsEventView: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "bullets"],
      properties: {
        summary: { type: "string" },
        bullets: { type: "array", minItems: 1, items: { type: "string" } }
      }
    },
    sectorIndexLinkage: {
      type: "object",
      additionalProperties: false,
      required: ["industry", "conceptBoards", "indexSnapshot", "interpretation"],
      properties: {
        industry: { type: ["string", "null"] },
        conceptBoards: { type: "array", items: { type: "string" } },
        indexSnapshot: { type: "array", items: { type: "string" } },
        interpretation: { type: "string" }
      }
    },
    scenarioTree: {
      type: "object",
      additionalProperties: false,
      required: ["bull", "base", "bear"],
      properties: {
        bull: {
          type: "object",
          additionalProperties: false,
          required: ["thesis", "probabilityLabel", "triggerSignals", "targetChangePctRange"],
          properties: {
            thesis: { type: "string" },
            probabilityLabel: { type: "string" },
            triggerSignals: { type: "array", minItems: 1, items: { type: "string" } },
            targetChangePctRange: {
              type: "object",
              additionalProperties: false,
              required: ["low", "high"],
              properties: {
                low: { type: ["number", "null"] },
                high: { type: ["number", "null"] }
              }
            }
          }
        },
        base: {
          type: "object",
          additionalProperties: false,
          required: ["thesis", "probabilityLabel", "triggerSignals", "targetChangePctRange"],
          properties: {
            thesis: { type: "string" },
            probabilityLabel: { type: "string" },
            triggerSignals: { type: "array", minItems: 1, items: { type: "string" } },
            targetChangePctRange: {
              type: "object",
              additionalProperties: false,
              required: ["low", "high"],
              properties: {
                low: { type: ["number", "null"] },
                high: { type: ["number", "null"] }
              }
            }
          }
        },
        bear: {
          type: "object",
          additionalProperties: false,
          required: ["thesis", "probabilityLabel", "triggerSignals", "targetChangePctRange"],
          properties: {
            thesis: { type: "string" },
            probabilityLabel: { type: "string" },
            triggerSignals: { type: "array", minItems: 1, items: { type: "string" } },
            targetChangePctRange: {
              type: "object",
              additionalProperties: false,
              required: ["low", "high"],
              properties: {
                low: { type: ["number", "null"] },
                high: { type: ["number", "null"] }
              }
            }
          }
        }
      }
    },
    riskMatrix: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "title", "detail", "mitigation"],
        properties: {
          level: { type: "string", enum: ["low", "medium", "high"] },
          title: { type: "string" },
          detail: { type: "string" },
          mitigation: { type: "string" }
        }
      }
    },
    invalidationSignals: { type: "array", minItems: 1, items: { type: "string" } },
    actionPlan: {
      type: "object",
      additionalProperties: false,
      required: ["observationLevels", "entryIdea", "stopLossIdea", "takeProfitIdea", "positionSizingIdea", "disclaimer"],
      properties: {
        observationLevels: { type: "array", items: { type: "number" } },
        entryIdea: { type: "string" },
        stopLossIdea: { type: "string" },
        takeProfitIdea: { type: "string" },
        positionSizingIdea: { type: "string" },
        disclaimer: { const: "仅供研究参考，不构成投资建议" }
      }
    },
    evidence: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "dimension", "thesis", "refs"],
        properties: {
          id: { type: "string" },
          dimension: { type: "string", enum: ["technical", "fundamental", "news_event", "sector_index", "data_quality"] },
          thesis: { type: "string" },
          refs: { type: "array", minItems: 1, items: { type: "string" } }
        }
      }
    },
    dataQuality: {
      type: "object",
      additionalProperties: false,
      required: ["sufficiency", "flags", "missingPieces"],
      properties: {
        sufficiency: { type: "string", enum: ["sufficient", "limited", "insufficient"] },
        flags: { type: "array", items: { type: "string" } },
        missingPieces: { type: "array", items: { type: "string" } }
      }
    },
    disclaimer: { const: "仅供研究参考，不构成投资建议" }
  }
} as const;

export const analysisResultJsonSchema = analysisReportV2JsonSchema;

export const analysisRunInputSchema = z.object({
  symbol: symbolIdSchema,
  templateId: analysisTemplateIdSchema,
  forecastWindow: forecastWindowSchema,
  llmProfileId: z.string().min(1)
});

export const analysisStartTaskInputSchema = analysisRunInputSchema.extend({
  workflowId: analysisWorkflowIdSchema.optional()
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
  result: analysisReportV2Schema,
  featurePack: featurePackSchema
});

export const analysisRunDetailSchema = analysisRunSchema.extend({
  rawResponse: z.string(),
  promptRequest: z.string(),
  validationReport: z.string()
});

export const analysisTaskSummarySchema = z.object({
  id: z.string(),
  symbol: symbolIdSchema,
  workflowId: analysisWorkflowIdSchema,
  templateId: analysisTemplateIdSchema,
  llmProfileId: z.string(),
  protocol: llmProtocolSchema,
  status: analysisTaskStatusSchema,
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  failedAt: isoDateTimeSchema.nullable(),
  errorSummary: z.string().nullable(),
  finalRunId: z.string().nullable(),
  currentStageKey: analysisStageKeySchema.nullable(),
  currentStageStatus: analysisStageStatusSchema.nullable()
});

export const analysisTaskDetailSchema = analysisTaskSummarySchema;

export const jsonRecordSchema = z.record(z.string(), z.unknown());

export const analysisStageRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  stageKey: analysisStageKeySchema,
  stageOrder: z.number().int().min(0),
  actorKind: analysisActorKindSchema,
  status: analysisStageStatusSchema,
  model: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  structuredInput: jsonRecordSchema.nullable(),
  structuredOutput: jsonRecordSchema.nullable(),
  rawPayloadRef: z.string().nullable(),
  usage: jsonRecordSchema.nullable(),
  errorSummary: z.string().nullable()
});

export const analysisTaskFilterSchema = z.object({
  symbol: z.string().optional(),
  status: analysisTaskStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).optional()
}).optional();

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
  workflowId: analysisWorkflowIdSchema,
  stageKey: analysisStageKeySchema.nullable(),
  status: analysisTaskStatusSchema,
  enqueuedAt: isoDateTimeSchema
});

export const analysisQueueStatusSchema = z.object({
  running: analysisQueueItemSchema.nullable(),
  pending: z.array(analysisQueueItemSchema),
  totalPending: z.number().int().min(0),
  updatedAt: isoDateTimeSchema
});
