import type {
  AnalysisReportV2,
  AnalysisTemplateId,
  FeaturePack,
  ForecastWindow,
  FundamentalEventStageResultV1,
  ResearchPlanV1,
  RiskChallengeStageResultV1,
  TechnicalStageResultV1
} from "@stockdesk/shared";

function renderFeatures(pack: FeaturePack): string {
  return pack.technicalFeatures
    .map((feature) => `- ${feature.featureRef} | ${feature.label}: ${feature.value ?? "null"}`)
    .join("\n");
}

function renderNews(pack: FeaturePack): string {
  if (pack.newsDigest.length === 0) {
    return "- 无";
  }

  return pack.newsDigest.map((item) => `- [${item.source}] ${item.title} | ${item.summary}`).join("\n");
}

function renderEvents(pack: FeaturePack): string {
  if (pack.eventDigest.length === 0) {
    return "- 无";
  }

  return pack.eventDigest.map((item) => `- [${item.type}] ${item.title} | ${item.summary}`).join("\n");
}

function renderJsonBlock(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function commonSystemLines() {
  return [
    "你是 A 股研究助手，只能基于输入快照做审慎分析。",
    "必须输出结构化 JSON，不要输出 Markdown。",
    "所有结论都必须可被输入中的证据或特征引用支持。",
    "禁止使用必涨、稳赚、100% 等确定性表述。"
  ];
}

export function buildSystemPrompt(templateId: AnalysisTemplateId): string {
  const lines = commonSystemLines();
  if (templateId === "technical_swing_v1") {
    lines.push("本次任务偏技术与波段交易视角。");
  } else {
    lines.push("本次任务偏快速研究视角。");
  }
  return lines.join("\n");
}

export function buildUserPrompt(input: {
  templateId: AnalysisTemplateId;
  forecastWindow: ForecastWindow;
  featurePack: FeaturePack;
}): string {
  return [
    `模板: ${input.templateId}`,
    `预测窗口: ${input.forecastWindow}`,
    "市场摘要:",
    ...input.featurePack.marketSummary.map((item) => `- ${item}`),
    "结构化特征（含技术、财务、市场快照）:",
    renderFeatures(input.featurePack),
    "事件摘要:",
    renderEvents(input.featurePack),
    "新闻摘要:",
    renderNews(input.featurePack),
    "数据质量提示:",
    ...(input.featurePack.dataQualityFlags.length > 0 ? input.featurePack.dataQualityFlags.map((item) => `- ${item}`) : ["- 无明显缺口"])
  ].join("\n");
}

export function buildResearchPlanSystemPrompt() {
  return [
    ...commonSystemLines(),
    "你当前的目标不是直接给最终结论，而是先制定研究计划。",
    "focusAreas、keyQuestions、evidencePriorities 必须具体、可执行。"
  ].join("\n");
}

export function buildResearchPlanUserPrompt(input: {
  templateId: AnalysisTemplateId;
  forecastWindow: ForecastWindow;
  researchContext: Record<string, unknown>;
}) {
  return [
    `模板: ${input.templateId}`,
    `预测窗口: ${input.forecastWindow}`,
    "请根据以下研究上下文制定研究计划 JSON：",
    renderJsonBlock(input.researchContext)
  ].join("\n");
}

export function buildTechnicalAnalysisSystemPrompt() {
  return [
    ...commonSystemLines(),
    "你当前只负责技术面与市场结构分析。",
    "不要评价基本面，不要重复新闻摘要。"
  ].join("\n");
}

export function buildTechnicalAnalysisUserPrompt(input: {
  researchContext: Record<string, unknown>;
  researchPlan: ResearchPlanV1;
}) {
  return [
    "研究计划：",
    renderJsonBlock(input.researchPlan),
    "研究上下文：",
    renderJsonBlock(input.researchContext)
  ].join("\n");
}

export function buildFundamentalEventSystemPrompt() {
  return [
    ...commonSystemLines(),
    "你当前只负责财务、新闻、事件与行业联动分析。",
    "不要重复技术面细节。"
  ].join("\n");
}

export function buildFundamentalEventUserPrompt(input: {
  researchContext: Record<string, unknown>;
  researchPlan: ResearchPlanV1;
}) {
  return [
    "研究计划：",
    renderJsonBlock(input.researchPlan),
    "研究上下文：",
    renderJsonBlock(input.researchContext)
  ].join("\n");
}

export function buildRiskChallengeSystemPrompt() {
  return [
    ...commonSystemLines(),
    "你当前扮演风险审查者。",
    "你的职责是挑战已有结论，并给出反证条件和置信度修正建议。"
  ].join("\n");
}

export function buildRiskChallengeUserPrompt(input: {
  researchContext: Record<string, unknown>;
  technical: TechnicalStageResultV1;
  fundamentalEvent: FundamentalEventStageResultV1;
}) {
  return [
    "研究上下文：",
    renderJsonBlock(input.researchContext),
    "技术面阶段结果：",
    renderJsonBlock(input.technical),
    "财务事件阶段结果：",
    renderJsonBlock(input.fundamentalEvent)
  ].join("\n");
}

export function buildFinalReportSystemPrompt() {
  return [
    ...commonSystemLines(),
    "你当前负责生成最终研究报告 analysis_report_v2。",
    "必须输出 bull/base/bear 三情景、riskMatrix、sectorIndexLinkage 和 actionPlan。"
  ].join("\n");
}

export function buildFinalReportUserPrompt(input: {
  symbol: string;
  forecastWindow: ForecastWindow;
  researchContext: Record<string, unknown>;
  researchPlan: ResearchPlanV1;
  technical: TechnicalStageResultV1;
  fundamentalEvent: FundamentalEventStageResultV1;
  riskChallenge: RiskChallengeStageResultV1;
}) {
  return [
    `标的: ${input.symbol}`,
    `预测窗口: ${input.forecastWindow}`,
    "研究上下文：",
    renderJsonBlock(input.researchContext),
    "研究计划：",
    renderJsonBlock(input.researchPlan),
    "技术面阶段结果：",
    renderJsonBlock(input.technical),
    "财务事件阶段结果：",
    renderJsonBlock(input.fundamentalEvent),
    "风险挑战阶段结果：",
    renderJsonBlock(input.riskChallenge)
  ].join("\n");
}

export function buildRepairPrompt(input: {
  stageKey: string;
  errorMessage: string;
  previousOutput: string;
}) {
  return [
    `阶段 ${input.stageKey} 的上一次 JSON 输出未通过校验。`,
    "请只输出修复后的 JSON，不要附带解释。",
    `校验错误: ${input.errorMessage}`,
    `上一次输出: ${input.previousOutput}`
  ].join("\n");
}

export function summarizeFinalReport(report: AnalysisReportV2) {
  return report.summary.join(" ");
}
