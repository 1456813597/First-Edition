import { eq, inArray } from "drizzle-orm";
import type { AppSettings, LlmProfile, ProviderProfile, SaveSettingsInput } from "@stockdesk/shared";
import { nowIso } from "@stockdesk/shared";
import { llmProfiles, providerProfiles, settingsProfiles } from "../schema/tables";
import type { StockdeskDb } from "../database";

const SETTINGS_ROW_ID = "main";

function parseHeaders(value: string | null): Record<string, string> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : null;
  } catch {
    return null;
  }
}

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
    const existingLlmProfiles = this.db.select().from(llmProfiles).all();
    const existingProviderProfiles = this.db.select().from(providerProfiles).all();

    this.db
      .insert(settingsProfiles)
      .values({
        id: SETTINGS_ROW_ID,
        market: "CN_A",
        defaultGroupId: input.defaultGroupId ?? existing?.defaultGroupId ?? null,
        activeLlmProfileId: input.activeLlmProfileId ?? existing?.activeLlmProfileId ?? null,
        activeProviderProfileId: input.activeProviderProfileId ?? existing?.activeProviderProfileId ?? null,
        disclaimerAcceptedAt: input.disclaimerAcceptedAt ?? existing?.disclaimerAcceptedAt ?? null,
        firstRunCompletedAt: existing?.firstRunCompletedAt ?? now,
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
          firstRunCompletedAt: existing?.firstRunCompletedAt ?? now,
          updatedAt: now
        }
      })
      .run();

    const llmIds = input.llmProfiles.map((profile) => profile.id);
    const providerIds = input.providerProfiles.map((profile) => profile.id);

    if (existingLlmProfiles.length > 0) {
      const removedIds = existingLlmProfiles.map((profile) => profile.id).filter((id) => !llmIds.includes(id));
      if (removedIds.length > 0) {
        this.db.delete(llmProfiles).where(inArray(llmProfiles.id, removedIds)).run();
      }
    }

    if (existingProviderProfiles.length > 0) {
      const removedIds = existingProviderProfiles.map((profile) => profile.id).filter((id) => !providerIds.includes(id));
      if (removedIds.length > 0) {
        this.db.delete(providerProfiles).where(inArray(providerProfiles.id, removedIds)).run();
      }
    }

    input.llmProfiles.forEach((profile) => {
      const existingProfile = existingLlmProfiles.find((item) => item.id === profile.id);
      this.db
        .insert(llmProfiles)
        .values({
          id: profile.id,
          name: profile.name,
          protocol: profile.protocol ?? "openai_chat_compatible",
          displayProviderName: profile.displayProviderName,
          baseUrl: profile.baseUrl,
          model: profile.model,
          timeoutMs: profile.timeoutMs,
          maxRetries: profile.maxRetries,
          supportsJsonSchema: profile.supportsJsonSchema,
          advancedHeaders: profile.advancedHeaders ? JSON.stringify(profile.advancedHeaders) : null,
          createdAt: existingProfile?.createdAt ?? now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: llmProfiles.id,
          set: {
            name: profile.name,
            protocol: profile.protocol ?? "openai_chat_compatible",
            displayProviderName: profile.displayProviderName,
            baseUrl: profile.baseUrl,
            model: profile.model,
            timeoutMs: profile.timeoutMs,
            maxRetries: profile.maxRetries,
            supportsJsonSchema: profile.supportsJsonSchema,
            advancedHeaders: profile.advancedHeaders ? JSON.stringify(profile.advancedHeaders) : null,
            updatedAt: now
          }
        })
        .run();
    });

    input.providerProfiles.forEach((profile) => {
      const existingProfile = existingProviderProfiles.find((item) => item.id === profile.id);
      this.db
        .insert(providerProfiles)
        .values({
          id: profile.id,
          providerType: profile.providerType,
          baseUrl: profile.baseUrl,
          enabled: profile.enabled,
          createdAt: existingProfile?.createdAt ?? now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: providerProfiles.id,
          set: {
            providerType: profile.providerType,
            baseUrl: profile.baseUrl,
            enabled: profile.enabled,
            updatedAt: now
          }
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
    protocol: (row.protocol as LlmProfile["protocol"]) ?? "openai_chat_compatible",
    displayProviderName: row.displayProviderName,
    baseUrl: row.baseUrl,
    model: row.model,
    timeoutMs: row.timeoutMs,
    maxRetries: row.maxRetries,
    supportsJsonSchema: row.supportsJsonSchema,
    advancedHeaders: parseHeaders(row.advancedHeaders),
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
