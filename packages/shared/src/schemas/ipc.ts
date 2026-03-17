import { z } from "zod";
import { urlSchema } from "./common";
import {
  analysisExportFormatSchema,
  analysisExportResultSchema,
  analysisQueueStatusSchema,
  analysisRunDetailSchema,
  analysisRunInputSchema,
  analysisRunSchema,
  analysisRunSummarySchema,
  analysisStageRunSchema,
  analysisStartTaskInputSchema,
  analysisTaskDetailSchema,
  analysisTaskFilterSchema,
  analysisTaskSummarySchema
} from "./analysis";
import { alertEventSchema, alertRuleSchema, alertRuleTypeSchema } from "./alert";
import {
  eventItemSchema,
  fundamentalSnapshotSchema,
  klineSeriesSchema,
  newsItemSchema,
  quoteSnapshotSchema,
  symbolLinkageSchema,
  symbolProfileSchema
} from "./market";
import { appSettingsSchema, llmProtocolSchema, saveSettingsInputSchema, testResultSchema } from "./settings";
import { addSymbolsInputSchema, batchResultSchema, importPreviewSchema, watchlistGroupSchema, watchlistItemSchema } from "./watchlist";

export const bootstrapPayloadSchema = z.object({
  settings: appSettingsSchema.nullable(),
  groups: z.array(watchlistGroupSchema)
});

const testLlmProfileDraftSchema = z.object({
  protocol: llmProtocolSchema,
  displayProviderName: z.string().min(1),
  baseUrl: urlSchema,
  model: z.string(),
  timeoutMs: z.number().int().min(1000),
  maxRetries: z.number().int().min(0).max(5),
  supportsJsonSchema: z.boolean(),
  advancedHeaders: z.record(z.string(), z.string()).nullable().default(null)
});

const llmProbeModeSchema = z.enum(["models_only", "models_then_minimal"]);

export const ipcContract = {
  "bootstrap:get": {
    input: z.void(),
    output: bootstrapPayloadSchema
  },
  "watchlist:listGroups": {
    input: z.void(),
    output: z.array(watchlistGroupSchema)
  },
  "watchlist:saveGroup": {
    input: z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      color: z.string().nullable().optional()
    }),
    output: watchlistGroupSchema
  },
  "watchlist:deleteGroup": {
    input: z.object({ id: z.string() }),
    output: z.void()
  },
  "watchlist:listItems": {
    input: z.object({ groupId: z.string().nullable().optional() }).optional(),
    output: z.array(watchlistItemSchema)
  },
  "watchlist:addSymbols": {
    input: addSymbolsInputSchema,
    output: batchResultSchema
  },
  "watchlist:removeItems": {
    input: z.object({ ids: z.array(z.string()).min(1) }),
    output: z.void()
  },
  "watchlist:importCsv": {
    input: z.object({ path: z.string() }),
    output: importPreviewSchema
  },
  "watchlist:applyImportPreview": {
    input: importPreviewSchema,
    output: batchResultSchema
  },
  "watchlist:exportJson": {
    input: z.object({ path: z.string() }),
    output: z.void()
  },
  "market:getQuotes": {
    input: z.object({ symbols: z.array(z.string()).min(1) }),
    output: z.array(quoteSnapshotSchema)
  },
  "market:getKline": {
    input: z.object({
      symbol: z.string(),
      timeframe: z.enum(["1m", "1d", "1w", "1M"]),
      adjustMode: z.enum(["qfq", "hfq", "none"]).default("qfq"),
      start: z.string().optional(),
      end: z.string().optional()
    }),
    output: klineSeriesSchema
  },
  "market:getNews": {
    input: z.object({
      symbol: z.string(),
      start: z.string().optional(),
      end: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(20)
    }),
    output: z.array(newsItemSchema)
  },
  "market:getEvents": {
    input: z.object({
      symbol: z.string(),
      start: z.string().optional(),
      end: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(20)
    }),
    output: z.array(eventItemSchema)
  },
  "market:getFundamentals": {
    input: z.object({
      symbol: z.string()
    }),
    output: fundamentalSnapshotSchema
  },
  "market:getSymbolProfile": {
    input: z.object({
      symbol: z.string()
    }),
    output: symbolProfileSchema
  },
  "market:getSymbolLinkage": {
    input: z.object({
      symbol: z.string()
    }),
    output: symbolLinkageSchema
  },
  "analysis:run": {
    input: analysisRunInputSchema,
    output: analysisRunSchema
  },
  "analysis:startTask": {
    input: analysisStartTaskInputSchema,
    output: analysisTaskSummarySchema
  },
  "analysis:listRuns": {
    input: z.object({
      symbol: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional()
    }).optional(),
    output: z.array(analysisRunSummarySchema)
  },
  "analysis:listTasks": {
    input: analysisTaskFilterSchema,
    output: z.array(analysisTaskSummarySchema)
  },
  "analysis:getTask": {
    input: z.object({ id: z.string() }),
    output: analysisTaskDetailSchema
  },
  "analysis:getTaskStages": {
    input: z.object({ taskId: z.string() }),
    output: z.array(analysisStageRunSchema)
  },
  "analysis:cancelTask": {
    input: z.object({ id: z.string() }),
    output: analysisTaskSummarySchema
  },
  "analysis:getRun": {
    input: z.object({ id: z.string() }),
    output: analysisRunDetailSchema
  },
  "analysis:getQueueStatus": {
    input: z.void(),
    output: analysisQueueStatusSchema
  },
  "analysis:exportRuns": {
    input: z.object({
      path: z.string().min(1),
      format: analysisExportFormatSchema,
      runIds: z.array(z.string()).min(1)
    }),
    output: analysisExportResultSchema
  },
  "alerts:listRules": {
    input: z.object({
      symbol: z.string().optional()
    }).optional(),
    output: z.array(alertRuleSchema)
  },
  "alerts:saveRule": {
    input: z.object({
      id: z.string().optional(),
      symbol: z.string(),
      type: alertRuleTypeSchema,
      name: z.string().optional(),
      enabled: z.boolean().optional(),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
    }),
    output: alertRuleSchema
  },
  "alerts:deleteRule": {
    input: z.object({ id: z.string() }),
    output: z.void()
  },
  "alerts:listEvents": {
    input: z.object({
      symbol: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional()
    }).optional(),
    output: z.array(alertEventSchema)
  },
  "alerts:markEventRead": {
    input: z.object({ id: z.string() }),
    output: z.void()
  },
  "alerts:evaluate": {
    input: z.object({
      symbol: z.string().optional()
    }).optional(),
    output: z.object({
      ok: z.boolean(),
      message: z.string(),
      triggered: z.number().int().min(0)
    })
  },
  "settings:get": {
    input: z.void(),
    output: appSettingsSchema.nullable()
  },
  "settings:save": {
    input: saveSettingsInputSchema,
    output: appSettingsSchema
  },
  "settings:testDataSource": {
    input: z.object({ profileId: z.string().optional() }).optional(),
    output: testResultSchema
  },
  "settings:testLlmProfile": {
    input: z.object({
      profileId: z.string(),
      draft: testLlmProfileDraftSchema.optional(),
      probeMode: llmProbeModeSchema.default("models_then_minimal")
    }),
    output: testResultSchema
  },
  "settings:clearSecrets": {
    input: z.object({ profileId: z.string() }),
    output: z.void()
  },
  "system:openExternal": {
    input: z.object({ url: z.string().url() }),
    output: z.void()
  },
  "system:pickImportFile": {
    input: z.void(),
    output: z.string().nullable()
  },
  "system:pickExportPath": {
    input: z.object({ kind: z.enum(["json", "markdown", "pdf"]) }),
    output: z.string().nullable()
  },
  "system:clearCache": {
    input: z.void(),
    output: z.void()
  }
} as const;

export type IpcChannel = keyof typeof ipcContract;
