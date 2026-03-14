import { z } from "zod";
import { isoDateTimeSchema } from "./common";
import { quoteSnapshotSchema } from "./market";

export const watchlistGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const watchlistTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable()
});

export const watchlistItemSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  groupId: z.string().nullable(),
  tags: z.array(watchlistTagSchema),
  latestQuote: quoteSnapshotSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const addSymbolsInputSchema = z.object({
  symbols: z.array(z.string()).min(1),
  groupId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

export const batchResultSchema = z.object({
  items: z.array(
    z.object({
      input: z.string(),
      success: z.boolean(),
      symbol: z.string().nullable(),
      message: z.string()
    })
  )
});

export const importPreviewSchema = z.object({
  rows: z.array(
    z.object({
      inputSymbol: z.string(),
      normalizedSymbol: z.string().nullable(),
      groupName: z.string().nullable(),
      tags: z.array(z.string()),
      status: z.enum(["ready", "invalid"]),
      message: z.string()
    })
  )
});

