import { z } from "zod";
import { isoDateTimeSchema, symbolIdSchema } from "./common";

export const timeframeSchema = z.enum(["1m", "1d", "1w", "1M"]);
export const adjustModeSchema = z.enum(["qfq", "hfq", "none"]);
export const quoteStatusSchema = z.enum(["normal", "halted", "st", "delisting"]);
export const quoteDataSourceSchema = z.enum(["live", "cache"]);

export const quoteSnapshotSchema = z.object({
  symbol: symbolIdSchema,
  name: z.string().min(1),
  last: z.number(),
  changePct: z.number(),
  turnover: z.number().nullable(),
  turnoverRate: z.number().nullable(),
  volumeRatio: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  open: z.number().nullable(),
  prevClose: z.number().nullable(),
  status: quoteStatusSchema,
  updatedAt: isoDateTimeSchema,
  dataSource: quoteDataSourceSchema.default("live")
});

export const klineBarSchema = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  turnover: z.number().nullable().optional()
});

export const klineSeriesSchema = z.object({
  symbol: symbolIdSchema,
  timeframe: timeframeSchema,
  adjustMode: adjustModeSchema,
  bars: z.array(klineBarSchema),
  indicators: z.record(z.string(), z.array(z.object({ time: z.string(), value: z.number().nullable() }))).optional(),
  updatedAt: isoDateTimeSchema
});

export const newsItemSchema = z.object({
  id: z.string(),
  symbol: symbolIdSchema,
  title: z.string(),
  summary: z.string(),
  source: z.string(),
  publishedAt: isoDateTimeSchema,
  url: z.string().url().nullable()
});

export const eventItemSchema = z.object({
  id: z.string(),
  symbol: symbolIdSchema,
  type: z.enum(["suspension", "earnings_guidance", "notice", "other"]),
  title: z.string(),
  summary: z.string(),
  occurredAt: isoDateTimeSchema,
  source: z.string()
});

export const fundamentalSnapshotSchema = z.object({
  symbol: symbolIdSchema,
  peTtm: z.number().nullable(),
  pb: z.number().nullable(),
  psTtm: z.number().nullable(),
  totalMarketCap: z.number().nullable(),
  circulatingMarketCap: z.number().nullable(),
  roe: z.number().nullable(),
  netProfitYoY: z.number().nullable(),
  revenueYoY: z.number().nullable(),
  reportDate: z.string().nullable(),
  source: z.string(),
  updatedAt: isoDateTimeSchema
});
