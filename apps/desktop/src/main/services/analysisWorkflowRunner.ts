import {
  buildFeaturePack,
  buildFinalReportSystemPrompt,
  buildFinalReportUserPrompt,
  buildFundamentalEventSystemPrompt,
  buildFundamentalEventUserPrompt,
  buildResearchPlanSystemPrompt,
  buildResearchPlanUserPrompt,
  buildRiskChallengeSystemPrompt,
  buildRiskChallengeUserPrompt,
  buildTechnicalAnalysisSystemPrompt,
  buildTechnicalAnalysisUserPrompt,
  summarizeFinalReport
} from "@stockdesk/analysis-core";
import type { AnalysisRepo, AnalysisTaskRepo } from "@stockdesk/db";
import {
  analysisReportV2JsonSchema,
  analysisReportV2Schema,
  forecastWindowSchema,
  fundamentalEventStageResultJsonSchema,
  fundamentalEventStageResultSchema,
  nowIso,
  researchPlanJsonSchema,
  researchPlanSchema,
  riskChallengeStageResultJsonSchema,
  riskChallengeStageResultSchema,
  technicalStageResultJsonSchema,
  technicalStageResultSchema,
  type AnalysisRun,
  type AnalysisRunInput,
  type AnalysisStageKey,
  type AnalysisStartTaskInput,
  type ForecastWindow,
  type FundamentalEventStageResultV1,
  type LlmProfile,
  type ResearchPlanV1,
  type RiskChallengeStageResultV1,
  type SymbolId,
  type TechnicalStageResultV1
} from "@stockdesk/shared";
import { DataServiceClient } from "./dataServiceClient";
import { LlmClient, type StructuredLlmResult } from "./llmClient";

export interface QueueTask {
  taskId: string;
  input: AnalysisStartTaskInput;
}

export interface AnalysisWorkflowStageDefinition {
  key: AnalysisStageKey;
  order: number;
  actorKind: "host" | "llm";
  title: string;
}

interface ResearchContext {
  symbol: SymbolId;
  templateId: AnalysisRunInput["templateId"];
  forecastWindow: ForecastWindow;
  generatedAt: string;
  marketSnapshot: {
    summaryLines: string[];
  };
  quoteSnapshot: Awaited<ReturnType<DataServiceClient["getQuotes"]>>[number] | null;
  symbolProfile: Awaited<ReturnType<DataServiceClient["getSymbolProfile"]>> | null;
  symbolLinkage: Awaited<ReturnType<DataServiceClient["getSymbolLinkage"]>> | null;
  fundamentalSnapshot: Awaited<ReturnType<DataServiceClient["getFundamentals"]>> | null;
  featurePack: ReturnType<typeof buildFeaturePack>;
  klineSummary: {
    dailyBarsCount: number;
    intradayBarsCount: number;
    latestClose: number | null;
    latestDailyTime: string | null;
  };
  historicalComparisons: Array<{
    id: string;
    createdAt: string;
    stance: string;
    summary: string;
    confidenceScore: number;
  }>;
  dataQualityFlags: string[];
}

interface ExpandedEvidence {
  selectedQuestions: string[];
  selectedExpansions: string[];
  historicalComparisons: ResearchContext["historicalComparisons"];
  industryBoard: ResearchContext["symbolLinkage"] extends infer T ? T : never;
}

export const ANALYSIS_WORKFLOW_ID = "stock_research_v1";

export const ANALYSIS_STAGES: AnalysisWorkflowStageDefinition[] = [
  { key: "snapshot_collect", order: 1, actorKind: "host", title: "研究快照收集" },
  { key: "research_plan", order: 2, actorKind: "llm", title: "研究计划" },
  { key: "evidence_expand", order: 3, actorKind: "host", title: "证据扩展" },
  { key: "technical_analysis", order: 4, actorKind: "llm", title: "技术分析" },
  { key: "fundamental_event_analysis", order: 5, actorKind: "llm", title: "财务与事件分析" },
  { key: "risk_challenge", order: 6, actorKind: "llm", title: "风险挑战" },
  { key: "final_report", order: 7, actorKind: "llm", title: "最终报告" },
  { key: "validate_and_persist", order: 8, actorKind: "host", title: "校验与持久化" }
];

const MARKET_BENCHMARKS: Array<{ symbol: SymbolId; label: string }> = [
  { symbol: "000001.SH", label: "上证" },
  { symbol: "399001.SZ", label: "深证成指" },
  { symbol: "399006.SZ", label: "创业板指" }
];

function stageMeta(key: AnalysisStageKey) {
  return ANALYSIS_STAGES.find((stage) => stage.key === key) as AnalysisWorkflowStageDefinition;
}

async function resolveOptional<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeForecastWindow(value: ForecastWindow) {
  return forecastWindowSchema.parse(value);
}

export class AnalysisWorkflowRunner {
  constructor(
    private readonly deps: {
      dataServiceClient: DataServiceClient;
      analysisRepo: AnalysisRepo;
      analysisTaskRepo: AnalysisTaskRepo;
    }
  ) {}

  private async createStage(taskId: string, key: AnalysisStageKey) {
    const existing = this.deps.analysisTaskRepo.getStageRunByTaskAndKey(taskId, key);
    if (existing) {
      return existing;
    }

    const meta = stageMeta(key);
    return this.deps.analysisTaskRepo.createStageRun({
      id: crypto.randomUUID(),
      taskId,
      stageKey: meta.key,
      stageOrder: meta.order,
      actorKind: meta.actorKind,
      status: "pending",
      model: null,
      title: meta.title,
      summary: "",
      startedAt: null,
      completedAt: null,
      inputPayload: null,
      outputPayload: null,
      rawPayload: null,
      usagePayload: null,
      errorSummary: null
    });
  }

  private async runHostStage<T>(input: {
    taskId: string;
    stageKey: AnalysisStageKey;
    structuredInput: Record<string, unknown>;
    execute: () => Promise<{ summary: string; output: T }>;
  }): Promise<T> {
    const stage = await this.createStage(input.taskId, input.stageKey);
    const startedAt = nowIso();
    this.deps.analysisTaskRepo.updateTask(input.taskId, {
      currentStageKey: input.stageKey,
      currentStageStatus: "running",
      status: "running"
    });
    this.deps.analysisTaskRepo.updateStageRun(stage.id, {
      status: "running",
      startedAt,
      inputPayload: JSON.stringify(input.structuredInput)
    });

    try {
      const result = await input.execute();
      this.deps.analysisTaskRepo.updateStageRun(stage.id, {
        status: "completed",
        summary: result.summary,
        completedAt: nowIso(),
        outputPayload: JSON.stringify(result.output)
      });
      this.deps.analysisTaskRepo.updateTask(input.taskId, {
        currentStageKey: input.stageKey,
        currentStageStatus: "completed"
      });
      return result.output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.analysisTaskRepo.updateStageRun(stage.id, {
        status: "failed",
        summary: message,
        completedAt: nowIso(),
        errorSummary: message
      });
      this.deps.analysisTaskRepo.updateTask(input.taskId, {
        status: "failed",
        failedAt: nowIso(),
        errorSummary: message,
        currentStageKey: input.stageKey,
        currentStageStatus: "failed"
      });
      throw error;
    }
  }

  private async runLlmStage<T>(input: {
    taskId: string;
    stageKey: AnalysisStageKey;
    profile: LlmProfile;
    apiKey: string;
    llmClient: LlmClient;
    structuredInput: Record<string, unknown>;
    systemPrompt: string;
    userPrompt: string;
    schemaName: string;
    schema: any;
    jsonSchema: Record<string, unknown>;
    summaryFromResult: (value: T) => string;
  }): Promise<{ output: T; response: StructuredLlmResult<T> }> {
    const stage = await this.createStage(input.taskId, input.stageKey);
    this.deps.analysisTaskRepo.updateTask(input.taskId, {
      currentStageKey: input.stageKey,
      currentStageStatus: "running",
      status: "running"
    });
    this.deps.analysisTaskRepo.updateStageRun(stage.id, {
      status: "running",
      startedAt: nowIso(),
      model: input.profile.model,
      inputPayload: JSON.stringify(input.structuredInput)
    });

    try {
      const response = await input.llmClient.invokeStructured<T>({
        profile: input.profile,
        apiKey: input.apiKey,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        schemaName: input.schemaName,
        schema: input.schema,
        jsonSchema: input.jsonSchema
      });
      this.deps.analysisTaskRepo.updateStageRun(stage.id, {
        status: "completed",
        summary: input.summaryFromResult(response.result),
        completedAt: nowIso(),
        outputPayload: JSON.stringify(response.result),
        rawPayload: response.rawPayload,
        usagePayload: response.usage ? JSON.stringify(response.usage) : null
      });
      this.deps.analysisTaskRepo.updateTask(input.taskId, {
        currentStageKey: input.stageKey,
        currentStageStatus: "completed"
      });
      return { output: response.result, response };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.analysisTaskRepo.updateStageRun(stage.id, {
        status: "failed",
        summary: message,
        completedAt: nowIso(),
        errorSummary: message
      });
      this.deps.analysisTaskRepo.updateTask(input.taskId, {
        status: "failed",
        failedAt: nowIso(),
        errorSummary: message,
        currentStageKey: input.stageKey,
        currentStageStatus: "failed"
      });
      throw error;
    }
  }

  private async buildResearchContext(input: AnalysisStartTaskInput) {
    const [quotes, daily, intraday, news, events, fundamentals, symbolProfile, symbolLinkage, tradingDays] = await Promise.all([
      resolveOptional(() => this.deps.dataServiceClient.getQuotes([input.symbol]), []),
      resolveOptional(
        () => this.deps.dataServiceClient.getKline({ symbol: input.symbol, timeframe: "1d", adjustMode: "qfq" }),
        { symbol: input.symbol, timeframe: "1d" as const, adjustMode: "qfq" as const, bars: [], updatedAt: nowIso() }
      ),
      resolveOptional(
        () => this.deps.dataServiceClient.getKline({ symbol: input.symbol, timeframe: "1m", adjustMode: "none" }),
        { symbol: input.symbol, timeframe: "1m" as const, adjustMode: "none" as const, bars: [], updatedAt: nowIso() }
      ),
      resolveOptional(() => this.deps.dataServiceClient.getNews(input.symbol, { limit: 8 }), []),
      resolveOptional(() => this.deps.dataServiceClient.getEvents(input.symbol, { limit: 8 }), []),
      resolveOptional(() => this.deps.dataServiceClient.getFundamentals(input.symbol), null),
      resolveOptional(() => this.deps.dataServiceClient.getSymbolProfile(input.symbol), null),
      resolveOptional(() => this.deps.dataServiceClient.getSymbolLinkage(input.symbol), null),
      resolveOptional(() => this.deps.dataServiceClient.getTradingDays(addDaysIso(0), addDaysIso(14)), {
        start: addDaysIso(0),
        end: addDaysIso(14),
        tradingDays: []
      })
    ]);

    const benchmarkQuotes = await resolveOptional(
      () => this.deps.dataServiceClient.getQuotes(MARKET_BENCHMARKS.map((item) => item.symbol)),
      []
    );
    const benchmarkBySymbol = new Map(benchmarkQuotes.map((item) => [item.symbol, item]));
    const benchmarkLine = MARKET_BENCHMARKS.map((item) => {
      const quote = benchmarkBySymbol.get(item.symbol);
      return quote ? `${item.label} ${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` : `${item.label} --`;
    });

    const marketSummary = [
      `标的 ${input.symbol} 当前分析窗口为 ${input.forecastWindow}。`,
      `宽基基准快照: ${benchmarkLine.join(" | ")}。`,
      tradingDays.tradingDays.length > 0
        ? `未来交易日参考: ${tradingDays.tradingDays.slice(0, 5).join(" / ")}。`
        : "交易日日历暂不可用，请结合节假日与停牌情况理解预测窗口。"
    ];

    const featurePack = buildFeaturePack({
      symbol: input.symbol,
      quote: quotes[0] ?? null,
      dailyBars: daily.bars,
      intradayBars: intraday.bars,
      news,
      events,
      fundamentals,
      marketSummary
    });

    return {
      symbol: input.symbol,
      templateId: input.templateId,
      forecastWindow: normalizeForecastWindow(input.forecastWindow),
      generatedAt: nowIso(),
      marketSnapshot: {
        summaryLines: marketSummary
      },
      quoteSnapshot: quotes[0] ?? null,
      symbolProfile,
      symbolLinkage,
      fundamentalSnapshot: fundamentals,
      featurePack,
      klineSummary: {
        dailyBarsCount: daily.bars.length,
        intradayBarsCount: intraday.bars.length,
        latestClose: daily.bars.at(-1)?.close ?? null,
        latestDailyTime: daily.bars.at(-1)?.time ?? null
      },
      historicalComparisons: this.deps.analysisRepo.listRecentRunsBySymbol(input.symbol, 5).map((run) => ({
        id: run.id,
        createdAt: run.createdAt,
        stance: run.stance,
        summary: run.summary,
        confidenceScore: run.confidenceScore
      })),
      dataQualityFlags: featurePack.dataQualityFlags
    } satisfies ResearchContext;
  }

  async runTask(task: QueueTask, profile: LlmProfile, apiKey: string, llmClient: LlmClient): Promise<AnalysisRun> {
    const startedAt = nowIso();
    this.deps.analysisTaskRepo.updateTask(task.taskId, {
      status: "running",
      startedAt,
      currentStageKey: "snapshot_collect",
      currentStageStatus: "running"
    });

    const researchContext = await this.runHostStage({
      taskId: task.taskId,
      stageKey: "snapshot_collect",
      structuredInput: {
        symbol: task.input.symbol,
        templateId: task.input.templateId,
        forecastWindow: task.input.forecastWindow
      },
      execute: async () => {
        const output = await this.buildResearchContext(task.input);
        return {
          summary: `已收集研究快照：${output.featurePack.technicalFeatures.length} 个特征，新闻 ${output.featurePack.newsDigest.length} 条，事件 ${output.featurePack.eventDigest.length} 条。`,
          output: output as unknown as Record<string, unknown>
        };
      }
    }) as unknown as ResearchContext;

    const researchPlan = (await this.runLlmStage<ResearchPlanV1>({
      taskId: task.taskId,
      stageKey: "research_plan",
      profile,
      apiKey,
      llmClient,
      structuredInput: researchContext as unknown as Record<string, unknown>,
      systemPrompt: buildResearchPlanSystemPrompt(),
      userPrompt: buildResearchPlanUserPrompt({
        templateId: task.input.templateId,
        forecastWindow: task.input.forecastWindow,
        researchContext: researchContext as unknown as Record<string, unknown>
      }),
      schemaName: "research_plan_v1",
      schema: researchPlanSchema,
      jsonSchema: researchPlanJsonSchema,
      summaryFromResult: (value) => value.focusAreas.join(" / ")
    })).output;

    const expandedEvidence = await this.runHostStage({
      taskId: task.taskId,
      stageKey: "evidence_expand",
      structuredInput: {
        researchContext,
        researchPlan
      },
      execute: async () => {
        const output = {
          selectedQuestions: researchPlan.keyQuestions.slice(0, 5),
          selectedExpansions: researchPlan.recommendedExpansions.slice(0, 5),
          historicalComparisons: researchContext.historicalComparisons,
          industryBoard: researchContext.symbolLinkage?.industryBoard ?? null,
          conceptBoards: researchContext.symbolLinkage?.conceptBoards ?? [],
          indexSnapshots: researchContext.symbolLinkage?.relatedIndexes ?? []
        };
        return {
          summary: `证据扩展完成：问题 ${output.selectedQuestions.length} 项，概念板块 ${output.conceptBoards.length} 项。`,
          output
        };
      }
    }) as unknown as ExpandedEvidence;

    const technical = (await this.runLlmStage<TechnicalStageResultV1>({
      taskId: task.taskId,
      stageKey: "technical_analysis",
      profile,
      apiKey,
      llmClient,
      structuredInput: {
        researchContext,
        researchPlan,
        expandedEvidence
      },
      systemPrompt: buildTechnicalAnalysisSystemPrompt(),
      userPrompt: buildTechnicalAnalysisUserPrompt({
        researchContext: {
          ...researchContext,
          expandedEvidence
        },
        researchPlan
      }),
      schemaName: "technical_stage_v1",
      schema: technicalStageResultSchema,
      jsonSchema: technicalStageResultJsonSchema,
      summaryFromResult: (value) => value.summary
    })).output;

    const fundamentalEvent = (await this.runLlmStage<FundamentalEventStageResultV1>({
      taskId: task.taskId,
      stageKey: "fundamental_event_analysis",
      profile,
      apiKey,
      llmClient,
      structuredInput: {
        researchContext,
        researchPlan,
        expandedEvidence
      },
      systemPrompt: buildFundamentalEventSystemPrompt(),
      userPrompt: buildFundamentalEventUserPrompt({
        researchContext: {
          ...researchContext,
          expandedEvidence
        },
        researchPlan
      }),
      schemaName: "fundamental_event_stage_v1",
      schema: fundamentalEventStageResultSchema,
      jsonSchema: fundamentalEventStageResultJsonSchema,
      summaryFromResult: (value) => value.summary
    })).output;

    const riskChallenge = (await this.runLlmStage<RiskChallengeStageResultV1>({
      taskId: task.taskId,
      stageKey: "risk_challenge",
      profile,
      apiKey,
      llmClient,
      structuredInput: {
        researchContext,
        technical,
        fundamentalEvent
      },
      systemPrompt: buildRiskChallengeSystemPrompt(),
      userPrompt: buildRiskChallengeUserPrompt({
        researchContext: {
          ...researchContext,
          expandedEvidence
        },
        technical,
        fundamentalEvent
      }),
      schemaName: "risk_challenge_stage_v1",
      schema: riskChallengeStageResultSchema,
      jsonSchema: riskChallengeStageResultJsonSchema,
      summaryFromResult: (value) => value.summary
    })).output;

    const finalReportResult = await this.runLlmStage({
      taskId: task.taskId,
      stageKey: "final_report",
      profile,
      apiKey,
      llmClient,
      structuredInput: {
        researchContext,
        researchPlan,
        expandedEvidence,
        technical,
        fundamentalEvent,
        riskChallenge
      },
      systemPrompt: buildFinalReportSystemPrompt(),
      userPrompt: buildFinalReportUserPrompt({
        symbol: task.input.symbol,
        forecastWindow: task.input.forecastWindow,
        researchContext: {
          ...researchContext,
          expandedEvidence
        },
        researchPlan,
        technical,
        fundamentalEvent,
        riskChallenge
      }),
      schemaName: "analysis_report_v2",
      schema: analysisReportV2Schema,
      jsonSchema: analysisReportV2JsonSchema,
      summaryFromResult: (value: any) => value.summary.join(" ")
    }) as { output: AnalysisRun["result"]; response: StructuredLlmResult<AnalysisRun["result"]> };

    const run = await this.runHostStage({
      taskId: task.taskId,
      stageKey: "validate_and_persist",
      structuredInput: {
        finalReport: finalReportResult.output
      },
      execute: async () => {
        const validated = analysisReportV2Schema.parse(finalReportResult.output);
        const createdAt = nowIso();
        const run: AnalysisRun = {
          id: crypto.randomUUID(),
          symbol: task.input.symbol,
          templateId: task.input.templateId,
          stance: validated.stance,
          confidenceScore: validated.confidence.score,
          forecastWindow: task.input.forecastWindow,
          createdAt,
          summary: summarizeFinalReport(validated),
          result: validated,
          featurePack: researchContext.featurePack
        };
        this.deps.analysisRepo.saveRun(run, {
          promptRequest: JSON.stringify({
            workflowId: ANALYSIS_WORKFLOW_ID,
            taskId: task.taskId,
            stages: this.deps.analysisTaskRepo.listStageRuns(task.taskId).map((stage) => ({
              stageKey: stage.stageKey,
              title: stage.title,
              summary: stage.summary
            }))
          }),
          rawResponse: finalReportResult.response.rawPayload,
          validationReport: finalReportResult.response.validationReport,
          llmProfileId: profile.id
        });
        this.deps.analysisTaskRepo.updateTask(task.taskId, {
          status: "completed",
          completedAt: nowIso(),
          finalRunId: run.id,
          currentStageKey: "validate_and_persist",
          currentStageStatus: "completed"
        });
        return {
          summary: "最终报告已校验并写入本地数据库。",
          output: run as unknown as Record<string, unknown>
        };
      }
    }) as unknown as AnalysisRun;

    return run;
  }
}
