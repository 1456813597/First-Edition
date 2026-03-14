import { eq } from "drizzle-orm";
import type { AppSettings, LlmProfile, ProviderProfile, SaveSettingsInput } from "@stockdesk/shared";
import { nowIso } from "@stockdesk/shared";
import { llmProfiles, providerProfiles, settingsProfiles } from "../schema/tables";
import type { StockdeskDb } from "../database";

const SETTINGS_ROW_ID = "main";

export class SettingsRepo {
  constructor(private readonly db: StockdeskDb) {}

  getSettings(): AppSettings | null {
    const settings = this.db.select().from(settingsProfiles).where(eq(settingsProfiles.id, SETTINGS_ROW_ID)).get();
    if (!settings) {
      return null;
    }

    const llm = this.db.select().from(llmProfiles).all().map(toLlmProfile);
    const providers = this.db.select().from(providerProfiles).all().map(toProviderProfile);

    return {
      market: "CN_A",
      defaultGroupId: settings.defaultGroupId,
      activeLlmProfileId: settings.activeLlmProfileId,
      activeProviderProfileId: settings.activeProviderProfileId,
      disclaimerAcceptedAt: settings.disclaimerAcceptedAt,
      firstRunCompletedAt: settings.firstRunCompletedAt,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
      llmProfiles: llm,
      providerProfiles: providers
    };
  }

  saveSettings(input: SaveSettingsInput): AppSettings {
    const now = nowIso();
    const existing = this.getSettings();
    this.db
      .insert(settingsProfiles)
      .values({
        id: SETTINGS_ROW_ID,
        market: "CN_A",
        defaultGroupId: input.defaultGroupId ?? existing?.defaultGroupId ?? null,
        activeLlmProfileId: input.activeLlmProfileId ?? existing?.activeLlmProfileId ?? null,
        activeProviderProfileId: input.activeProviderProfileId ?? existing?.activeProviderProfileId ?? null,
        disclaimerAcceptedAt: input.disclaimerAcceptedAt ?? existing?.disclaimerAcceptedAt ?? null,
        firstRunCompletedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: settingsProfiles.id,
        set: {
          defaultGroupId: input.defaultGroupId ?? existing?.defaultGroupId ?? null,
          activeLlmProfileId: input.activeLlmProfileId ?? existing?.activeLlmProfileId ?? null,
          activeProviderProfileId: input.activeProviderProfileId ?? existing?.activeProviderProfileId ?? null,
          disclaimerAcceptedAt: input.disclaimerAcceptedAt ?? existing?.disclaimerAcceptedAt ?? null,
          firstRunCompletedAt: now,
          updatedAt: now
        }
      })
      .run();

    this.db.delete(llmProfiles).run();
    this.db.delete(providerProfiles).run();

    input.llmProfiles.forEach((profile) => {
      this.db
        .insert(llmProfiles)
        .values({
          id: profile.id,
          name: profile.name,
          baseUrl: profile.baseUrl,
          model: profile.model,
          timeoutMs: profile.timeoutMs,
          maxRetries: profile.maxRetries,
          supportsJsonSchema: profile.supportsJsonSchema,
          createdAt: now,
          updatedAt: now
        })
        .run();
    });

    input.providerProfiles.forEach((profile) => {
      this.db
        .insert(providerProfiles)
        .values({
          id: profile.id,
          providerType: profile.providerType,
          baseUrl: profile.baseUrl,
          enabled: profile.enabled,
          createdAt: now,
          updatedAt: now
        })
        .run();
    });

    return this.getSettings() as AppSettings;
  }
}

function toLlmProfile(row: typeof llmProfiles.$inferSelect): LlmProfile {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    model: row.model,
    timeoutMs: row.timeoutMs,
    maxRetries: row.maxRetries,
    supportsJsonSchema: row.supportsJsonSchema,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toProviderProfile(row: typeof providerProfiles.$inferSelect): ProviderProfile {
  return {
    id: row.id,
    providerType: "akshare",
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

