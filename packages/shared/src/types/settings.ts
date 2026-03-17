export type LlmProtocol = "openai_responses" | "openai_chat_compatible" | "openrouter_api" | "bailian_responses_cn";
export type LlmProbeMode = "models_only" | "models_then_minimal";

export interface LlmProfile {
  id: string;
  name: string;
  protocol: LlmProtocol;
  displayProviderName: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  supportsJsonSchema: boolean;
  advancedHeaders: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderProfile {
  id: string;
  providerType: "akshare";
  baseUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  market: "CN_A";
  defaultGroupId: string | null;
  activeLlmProfileId: string | null;
  activeProviderProfileId: string | null;
  disclaimerAcceptedAt: string | null;
  firstRunCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  llmProfiles: LlmProfile[];
  providerProfiles: ProviderProfile[];
}

export interface BootstrapPayload {
  settings: AppSettings | null;
  groups: import("./watchlist").WatchlistGroup[];
}

export interface SaveSettingsInput {
  market: "CN_A";
  defaultGroupId?: string | null;
  activeLlmProfileId?: string | null;
  activeProviderProfileId?: string | null;
  disclaimerAcceptedAt?: string | null;
  llmProfiles: Array<Omit<LlmProfile, "createdAt" | "updatedAt"> & { apiKey?: string }>;
  providerProfiles: Array<Omit<ProviderProfile, "createdAt" | "updatedAt">>;
}

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}
