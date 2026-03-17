import type { EventItem, NewsItem, SymbolId } from "./market";

export type Stance = "bullish" | "neutral" | "bearish";
export type ForecastWindow = "3d" | "10d" | "20d";
export type DataSufficiency = "sufficient" | "limited" | "insufficient";
export type AnalysisTemplateId = "quick_scan_v1" | "technical_swing_v1";
export type AnalysisWorkflowId = "stock_research_v1";
export type AnalysisTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AnalysisStageStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AnalysisActorKind = "host" | "llm";
export type AnalysisStageKey =
  | "snapshot_collect"
  | "research_plan"
  | "evidence_expand"
  | "technical_analysis"
  | "fundamental_event_analysis"
  | "risk_challenge"
  | "final_report"
  | "validate_and_persist";

export interface EvidencePoint {
  dimension: "technical" | "event" | "news" | "data_quality";
  thesis: string;
  featureRefs: string[];
}

export interface LegacyAnalysisResultV1 {
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

export interface ResearchPlanV1 {
  schemaVersion: "analysis.stage.research_plan.v1";
  focusAreas: string[];
  keyQuestions: string[];
  evidencePriorities: string[];
  dataGaps: string[];
  recommendedExpansions: string[];
}

export interface TechnicalStageResultV1 {
  schemaVersion: "analysis.stage.technical.v1";
  stanceHint: Stance;
  summary: string;
  trendAssessment: string;
  momentumAssessment: string;
  supportLevels: number[];
  resistanceLevels: number[];
  evidence: string[];
}

export interface FundamentalEventStageResultV1 {
  schemaVersion: "analysis.stage.fundamental_event.v1";
  stanceHint: Stance;
  summary: string;
  fundamentalAssessment: string;
  newsAssessment: string;
  linkageAssessment: string;
  evidence: string[];
}

export interface RiskChallengeStageResultV1 {
  schemaVersion: "analysis.stage.risk_challenge.v1";
  summary: string;
  confidenceAdjustment: number;
  risks: string[];
  invalidationSignals: string[];
  opposingEvidence: string[];
}

export interface ReportSection {
  summary: string;
  bullets: string[];
}

export interface ScenarioBranch {
  thesis: string;
  probabilityLabel: string;
  triggerSignals: string[];
  targetChangePctRange: {
    low: number | null;
    high: number | null;
  };
}

export interface RiskMatrixItem {
  level: "low" | "medium" | "high";
  title: string;
  detail: string;
  mitigation: string;
}

export interface SectorIndexLinkageView {
  industry: string | null;
  conceptBoards: string[];
  indexSnapshot: string[];
  interpretation: string;
}

export interface AnalysisReportV2 {
  schemaVersion: "analysis_report_v2";
  symbol: SymbolId;
  asOf: string;
  forecastWindow: ForecastWindow;
  marketRegime: ReportSection;
  stance: Stance;
  confidence: {
    score: number;
    rationale: string;
  };
  summary: string[];
  technicalView: ReportSection;
  fundamentalView: ReportSection;
  newsEventView: ReportSection;
  sectorIndexLinkage: SectorIndexLinkageView;
  scenarioTree: {
    bull: ScenarioBranch;
    base: ScenarioBranch;
    bear: ScenarioBranch;
  };
  riskMatrix: RiskMatrixItem[];
  invalidationSignals: string[];
  actionPlan: {
    observationLevels: number[];
    entryIdea: string;
    stopLossIdea: string;
    takeProfitIdea: string;
    positionSizingIdea: string;
    disclaimer: "仅供研究参考，不构成投资建议";
  };
  evidence: Array<{
    id: string;
    dimension: "technical" | "fundamental" | "news_event" | "sector_index" | "data_quality";
    thesis: string;
    refs: string[];
  }>;
  dataQuality: {
    sufficiency: DataSufficiency;
    flags: string[];
    missingPieces: string[];
  };
  disclaimer: "仅供研究参考，不构成投资建议";
}

export interface AnalysisRunInput {
  symbol: SymbolId;
  templateId: AnalysisTemplateId;
  forecastWindow: ForecastWindow;
  llmProfileId: string;
}

export interface AnalysisStartTaskInput extends AnalysisRunInput {
  workflowId?: AnalysisWorkflowId;
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
  result: AnalysisReportV2;
  featurePack: FeaturePack;
}

export interface AnalysisRunDetail extends AnalysisRun {
  rawResponse: string;
  promptRequest: string;
  validationReport: string;
}

export interface AnalysisTaskSummary {
  id: string;
  symbol: SymbolId;
  workflowId: AnalysisWorkflowId;
  templateId: AnalysisTemplateId;
  llmProfileId: string;
  protocol: import("./settings").LlmProtocol;
  status: AnalysisTaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorSummary: string | null;
  finalRunId: string | null;
  currentStageKey: AnalysisStageKey | null;
  currentStageStatus: AnalysisStageStatus | null;
}

export interface AnalysisTaskDetail extends AnalysisTaskSummary {}

export interface AnalysisStageRun {
  id: string;
  taskId: string;
  stageKey: AnalysisStageKey;
  stageOrder: number;
  actorKind: AnalysisActorKind;
  status: AnalysisStageStatus;
  model: string | null;
  title: string;
  summary: string;
  startedAt: string | null;
  completedAt: string | null;
  structuredInput: Record<string, unknown> | null;
  structuredOutput: Record<string, unknown> | null;
  rawPayloadRef: string | null;
  usage: Record<string, unknown> | null;
  errorSummary: string | null;
}

export interface AnalysisTaskFilter {
  symbol?: string;
  status?: AnalysisTaskStatus;
  limit?: number;
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
  workflowId: AnalysisWorkflowId;
  stageKey: AnalysisStageKey | null;
  status: AnalysisTaskStatus;
  enqueuedAt: string;
}

export interface AnalysisQueueStatus {
  running: AnalysisQueueItem | null;
  pending: AnalysisQueueItem[];
  totalPending: number;
  updatedAt: string;
}
