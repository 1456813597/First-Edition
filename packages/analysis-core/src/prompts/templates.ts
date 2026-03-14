import type { AnalysisTemplateId, FeaturePack, ForecastWindow } from "@stockdesk/shared";

function schemaInstructions() {
  return [
    "输出必须是严格 JSON。",
    "禁止使用必涨、稳赚、100% 等确定性表述。",
    "当数据不足时，dataSufficiency 必须为 limited 或 insufficient。",
    "evidence[].featureRefs 必须引用输入中的 featureRef。",
    "actionPlan.disclaimer 必须为: 仅供研究参考，不构成投资建议。"
  ];
}

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

export function buildSystemPrompt(templateId: AnalysisTemplateId): string {
  const common = [
    "你是 A 股研究助手，只能基于输入快照做审慎分析。",
    "必须输出结构化 JSON，不要输出 Markdown。",
    "必须明确说明反证条件和风险。"
  ];

  if (templateId === "technical_swing_v1") {
    common.push("更强调趋势、量价、支撑压力和技术信号。");
  } else {
    common.push("给出 30 秒内可读完的快速看盘结论。");
  }

  return common.join("\n");
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
    "技术与结构化特征:",
    renderFeatures(input.featurePack),
    "事件摘要:",
    renderEvents(input.featurePack),
    "新闻摘要:",
    renderNews(input.featurePack),
    "数据质量提示:",
    ...(input.featurePack.dataQualityFlags.length > 0 ? input.featurePack.dataQualityFlags.map((item) => `- ${item}`) : ["- 无明显缺口"]),
    "输出约束:",
    ...schemaInstructions().map((item) => `- ${item}`)
  ].join("\n");
}

