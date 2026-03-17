import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../database";
import { SettingsRepo } from "./settingsRepo";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("SettingsRepo", () => {
  it("loads a legacy profile from an older schema and applies protocol defaults", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "stockdesk-db-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "legacy.db");

    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE settings_profiles (
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

      CREATE TABLE llm_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        timeout_ms INTEGER NOT NULL,
        max_retries INTEGER NOT NULL,
        supports_json_schema INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE provider_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        provider_type TEXT NOT NULL,
        base_url TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    legacy.prepare(`
      INSERT INTO settings_profiles (
        id, market, default_group_id, active_llm_profile_id, active_provider_profile_id,
        disclaimer_accepted_at, first_run_completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "main",
      "CN_A",
      null,
      "legacy-llm",
      "provider-1",
      "2026-03-17T00:00:00.000Z",
      "2026-03-17T00:00:00.000Z",
      "2026-03-17T00:00:00.000Z",
      "2026-03-17T00:00:00.000Z"
    );

    legacy.prepare(`
      INSERT INTO llm_profiles (
        id, name, base_url, model, timeout_ms, max_retries, supports_json_schema, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "legacy-llm",
      "Legacy Profile",
      "https://api.openai.com/v1",
      "gpt-4.1",
      30000,
      1,
      1,
      "2026-03-17T00:00:00.000Z",
      "2026-03-17T00:00:00.000Z"
    );

    legacy.prepare(`
      INSERT INTO provider_profiles (
        id, provider_type, base_url, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "provider-1",
      "akshare",
      "http://127.0.0.1:18765",
      1,
      "2026-03-17T00:00:00.000Z",
      "2026-03-17T00:00:00.000Z"
    );
    legacy.close();

    const { db, sqlite } = createDatabase(dbPath);
    const repo = new SettingsRepo(db);
    const settings = repo.getSettings();

    expect(settings).not.toBeNull();
    expect(settings?.llmProfiles).toHaveLength(1);
    expect(settings?.llmProfiles[0]?.protocol).toBe("openai_chat_compatible");
    expect(settings?.llmProfiles[0]?.displayProviderName).toBe("OpenAI Compatible");
    expect(settings?.llmProfiles[0]?.advancedHeaders).toBeNull();
    sqlite.close();
  });
});
