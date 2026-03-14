import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const watchlistGroups = sqliteTable("watchlist_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const watchlistItems = sqliteTable("watchlist_items", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  groupId: text("group_id").references(() => watchlistGroups.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const watchlistTags = sqliteTable("watchlist_tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color")
});

export const watchlistItemTags = sqliteTable("watchlist_item_tags", {
  itemId: text("item_id").notNull().references(() => watchlistItems.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => watchlistTags.id, { onDelete: "cascade" })
});

export const settingsProfiles = sqliteTable("settings_profiles", {
  id: text("id").primaryKey(),
  market: text("market").notNull().default("CN_A"),
  defaultGroupId: text("default_group_id"),
  activeLlmProfileId: text("active_llm_profile_id"),
  activeProviderProfileId: text("active_provider_profile_id"),
  disclaimerAcceptedAt: text("disclaimer_accepted_at"),
  firstRunCompletedAt: text("first_run_completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const llmProfiles = sqliteTable("llm_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  timeoutMs: integer("timeout_ms").notNull(),
  maxRetries: integer("max_retries").notNull(),
  supportsJsonSchema: integer("supports_json_schema", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const providerProfiles = sqliteTable("provider_profiles", {
  id: text("id").primaryKey(),
  providerType: text("provider_type").notNull(),
  baseUrl: text("base_url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const quoteCache = sqliteTable("quote_cache", {
  symbol: text("symbol").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const klineBars = sqliteTable("kline_bars", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const newsCache = sqliteTable("news_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const eventCache = sqliteTable("event_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const analysisRuns = sqliteTable("analysis_runs", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  templateId: text("template_id").notNull(),
  forecastWindow: text("forecast_window").notNull(),
  stance: text("stance").notNull(),
  confidenceScore: integer("confidence_score").notNull(),
  summary: text("summary").notNull(),
  llmProfileId: text("llm_profile_id").notNull(),
  createdAt: text("created_at").notNull()
});

export const analysisArtifacts = sqliteTable("analysis_artifacts", {
  runId: text("run_id").primaryKey().references(() => analysisRuns.id, { onDelete: "cascade" }),
  featurePack: blob("feature_pack", { mode: "buffer" }).notNull(),
  promptRequest: blob("prompt_request", { mode: "buffer" }).notNull(),
  rawResponse: blob("raw_response", { mode: "buffer" }).notNull(),
  parsedResponse: blob("parsed_response", { mode: "buffer" }).notNull(),
  validationReport: blob("validation_report", { mode: "buffer" }).notNull()
});

export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  params: text("params").notNull().default("{}"),
  lastTriggeredAt: text("last_triggered_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const alertEvents = sqliteTable("alert_events", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  context: text("context").notNull().default("{}"),
  triggeredAt: text("triggered_at").notNull(),
  readAt: text("read_at")
});

export const importExportJobs = sqliteTable("import_export_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at")
});
