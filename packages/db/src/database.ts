import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema/tables";

export type StockdeskDb = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseHandle {
  sqlite: Database.Database;
  db: StockdeskDb;
}

function ensureColumn(
  sqlite: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
) {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      id TEXT PRIMARY KEY NOT NULL,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      group_id TEXT REFERENCES watchlist_groups(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_tags (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlist_item_tags (
      item_id TEXT NOT NULL REFERENCES watchlist_items(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES watchlist_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS settings_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      market TEXT NOT NULL DEFAULT 'CN_A',
      default_group_id TEXT,
      active_llm_profile_id TEXT,
      active_provider_profile_id TEXT,
      disclaimer_accepted_at TEXT,
      first_run_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'openai_chat_compatible',
      display_provider_name TEXT NOT NULL DEFAULT 'OpenAI Compatible',
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL,
      max_retries INTEGER NOT NULL,
      supports_json_schema INTEGER NOT NULL DEFAULT 0,
      advanced_headers TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      provider_type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quote_cache (
      symbol TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kline_bars (
      cache_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY NOT NULL,
      symbol TEXT NOT NULL,
      template_id TEXT NOT NULL,
      forecast_window TEXT NOT NULL,
      stance TEXT NOT NULL,
      confidence_score INTEGER NOT NULL,
      summary TEXT NOT NULL,
      llm_profile_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      symbol TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      llm_profile_id TEXT NOT NULL,
      protocol TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      error_summary TEXT,
      final_run_id TEXT,
      current_stage_key TEXT,
      current_stage_status TEXT
    );

    CREATE TABLE IF NOT EXISTS analysis_stage_runs (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
      stage_key TEXT NOT NULL,
      stage_order INTEGER NOT NULL,
      actor_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      model TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      input_payload TEXT,
      output_payload TEXT,
      raw_payload TEXT,
      usage_payload TEXT,
      error_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS analysis_artifacts (
      run_id TEXT PRIMARY KEY NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      feature_pack BLOB NOT NULL,
      prompt_request BLOB NOT NULL,
      raw_response BLOB NOT NULL,
      parsed_response BLOB NOT NULL,
      validation_report BLOB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      params TEXT NOT NULL DEFAULT '{}',
      last_triggered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY NOT NULL,
      rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      triggered_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS import_export_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  ensureColumn(sqlite, "llm_profiles", "protocol", "protocol TEXT NOT NULL DEFAULT 'openai_chat_compatible'");
  ensureColumn(sqlite, "llm_profiles", "display_provider_name", "display_provider_name TEXT NOT NULL DEFAULT 'OpenAI Compatible'");
  ensureColumn(sqlite, "llm_profiles", "advanced_headers", "advanced_headers TEXT");
}

export function createDatabase(dbPath: string): DatabaseHandle {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
