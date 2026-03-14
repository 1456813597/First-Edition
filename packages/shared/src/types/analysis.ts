import type { EventItem, NewsItem, SymbolId } from "./market";

export type Stance = "bullish" | "neutral" | "bearish";

export type ForecastWindow = "3d" | "10d" | "20d";

export type DataSufficiency = "sufficient" | "limited" | "insufficient";

export interface EvidencePoint {
  dimension: "technical" | "event" | "news" | "data_quality";
  thesis: string;
  featureRefs: string[];
}

export interface AnalysisResultV1 {
  schemaVersion: "analysis.v1";
  summaryLines: [string, string, string, ...string[]];
  stance: Stance;
  forecastWindow: ForecastWindow;
  targetPriceRange: { low: number | null; high: number | null };
  targetChangePctRange: { low: number | null; high: number | null };
  confidence: { score: number; rationale: string };
  dataSufficiency: DataSufficiency;
  evidence: EvidencePoint[];
  risks: string[];
  invalidationSignals: string[];
  actionPlan: {
    observationLevels: number[];
    stopLossIdea: string;
    takeProfitIdea: string;
    disclaimer: "仅供研究参考，不构成投资建议";
  };
}

export type AnalysisTemplateId = "quick_scan_v1" | "technical_swing_v1";

export interface FeatureValue {
  featureRef: string;
  label: string;
  value: string | number | boolean | null;
}

export interface FeaturePack {
  symbol: SymbolId;
  generatedAt: string;
  marketSummary: string[];
  technicalFeatures: FeatureValue[];
  eventDigest: EventItem[];
  newsDigest: NewsItem[];
  dataQualityFlags: string[];
}

export interface AnalysisRunInput {
  symbol: SymbolId;
  templateId: AnalysisTemplateId;
  forecastWindow: ForecastWindow;
  llmProfileId: string;
}

export interface AnalysisRunSummary {
  id: string;
  symbol: SymbolId;
  templateId: AnalysisTemplateId;
  stance: Stance;
  confidenceScore: number;
  forecastWindow: ForecastWindow;
  createdAt: string;
  summary: string;
}

export interface AnalysisRun extends AnalysisRunSummary {
  result: AnalysisResultV1;
  featurePack: FeaturePack;
}

export interface AnalysisRunDetail extends AnalysisRun {
  rawResponse: string;
  promptRequest: string;
  validationReport: string;
}

export type AnalysisExportFormat = "markdown" | "pdf";

export interface AnalysisExportResult {
  path: string;
  format: AnalysisExportFormat;
  exportedCount: number;
}

export interface AnalysisQueueItem {
  id: string;
  symbol: SymbolId;
  templateId: AnalysisTemplateId;
  forecastWindow: ForecastWindow;
  enqueuedAt: string;
}

export interface AnalysisQueueStatus {
  running: AnalysisQueueItem | null;
  pending: AnalysisQueueItem[];
  totalPending: number;
  updatedAt: string;
}
