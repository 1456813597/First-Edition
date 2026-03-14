import { z } from "zod";
import { isoDateTimeSchema, symbolIdSchema } from "./common";

export const alertRuleTypeSchema = z.enum([
  "price_above",
  "price_below",
  "price_below_ma20",
  "volume_breakout",
  "limit_up_open"
]);

const alertPayloadValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const alertRuleSchema = z.object({
  id: z.string(),
  symbol: symbolIdSchema,
  type: alertRuleTypeSchema,
  name: z.string(),
  enabled: z.boolean(),
  params: z.record(z.string(), alertPayloadValueSchema),
  lastTriggeredAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const alertEventSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  symbol: symbolIdSchema,
  type: alertRuleTypeSchema,
  title: z.string(),
  message: z.string(),
  context: z.record(z.string(), alertPayloadValueSchema),
  triggeredAt: isoDateTimeSchema,
  readAt: isoDateTimeSchema.nullable()
});
