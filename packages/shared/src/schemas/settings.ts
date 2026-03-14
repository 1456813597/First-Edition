import { z } from "zod";
import { isoDateTimeSchema, urlSchema } from "./common";

export const llmProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: urlSchema,
  model: z.string(),
  timeoutMs: z.number().int().min(1000),
  maxRetries: z.number().int().min(0).max(5),
  supportsJsonSchema: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const providerProfileSchema = z.object({
  id: z.string(),
  providerType: z.literal("akshare"),
  baseUrl: urlSchema,
  enabled: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const appSettingsSchema = z.object({
  market: z.literal("CN_A"),
  defaultGroupId: z.string().nullable(),
  activeLlmProfileId: z.string().nullable(),
  activeProviderProfileId: z.string().nullable(),
  disclaimerAcceptedAt: isoDateTimeSchema.nullable(),
  firstRunCompletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  llmProfiles: z.array(llmProfileSchema),
  providerProfiles: z.array(providerProfileSchema)
});

export const saveSettingsInputSchema = z.object({
  market: z.literal("CN_A"),
  defaultGroupId: z.string().nullable().optional(),
  activeLlmProfileId: z.string().nullable().optional(),
  activeProviderProfileId: z.string().nullable().optional(),
  disclaimerAcceptedAt: isoDateTimeSchema.nullable().optional(),
  llmProfiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      baseUrl: urlSchema,
      model: z.string(),
      timeoutMs: z.number().int().min(1000),
      maxRetries: z.number().int().min(0).max(5),
      supportsJsonSchema: z.boolean(),
      apiKey: z.string().optional()
    })
  ),
  providerProfiles: z.array(
    z.object({
      id: z.string(),
      providerType: z.literal("akshare"),
      baseUrl: urlSchema,
      enabled: z.boolean()
    })
  )
});

export const testResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

