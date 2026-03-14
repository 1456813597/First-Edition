import { z } from "zod";

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const symbolIdSchema = z
  .string()
  .regex(/^\d{6}\.(SH|SZ|BJ)$/)
  .transform((value) => value as `${string}.${"SH" | "SZ" | "BJ"}`);

export const urlSchema = z.string().url();

