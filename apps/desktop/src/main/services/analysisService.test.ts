import { describe, expect, it, vi } from "vitest";
import type {
  AnalysisRun,
  AnalysisStageRun,
  AnalysisTaskDetail,
  AnalysisTaskFilter,
  AnalysisTaskSummary,
  AppSettings,
  LlmProfile
} from "@stockdesk/shared";
import { AnalysisService } from "./analysisService";

function makeProfile(overrides: Partial<LlmProfile> = {}): LlmProfile {
  const now = new Date().toISOString();
  return {
    id: "profile-1",
    name: "Default",
    protocol: "openai_chat_compatible",
    displayProviderName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.2",
    timeoutMs: 30000,
    maxRetries: 1,
    supportsJsonSchema: true,
    advancedHeaders: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makeSettings(profile: LlmProfile): AppSettings {
  const now = new Date().toISOString();
  return {
    market: "CN_A",
    defaultGroupId: null,
    activeLlmProfileId: profile.id,
    activeProviderProfileId: null,
    disclaimerAcceptedAt: now,
    firstRunCompletedAt: now,
    createdAt: now,
    updatedAt: now,
    llmProfiles: [profile],
    providerProfiles: []
  };
}

function createAnalysisTaskRepoStub() {
  const tasks = new Map<string, AnalysisTaskDetail>();
  const stages = new Map<string, AnalysisStageRun>();

  return {
    createTask(task: AnalysisTaskDetail) {
      tasks.set(task.id, { ...task });
      return tasks.get(task.id) as AnalysisTaskDetail;
    },
    createTaskWithStageRuns(task: AnalysisTaskDetail, stageRuns: AnalysisStageRun[]) {
      tasks.set(task.id, { ...task });
      for (const stage of stageRuns) {
        stages.set(stage.id, { ...stage });
      }
      return tasks.get(task.id) as AnalysisTaskDetail;
    },
    updateTask(id: string, patch: Partial<AnalysisTaskDetail>) {
      const current = tasks.get(id);
      if (!current) {
        throw new Error(`Task ${id} not found`);
      }
      tasks.set(id, { ...current, ...patch });
      return tasks.get(id) as AnalysisTaskDetail;
    },
    getTask(id: string) {
      return tasks.get(id) ?? null;
    },
    listTasks(filter?: AnalysisTaskFilter): AnalysisTaskSummary[] {
      return [...tasks.values()]
        .filter((task) => {
          if (filter?.symbol && task.symbol !== filter.symbol) {
            return false;
          }
          if (filter?.status && task.status !== filter.status) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, filter?.limit ?? 100);
    },
    createStageRun(stage: AnalysisStageRun) {
      stages.set(stage.id, { ...stage });
      return stages.get(stage.id) as AnalysisStageRun;
    },
    updateStageRun(id: string, patch: Partial<AnalysisStageRun>) {
      const current = stages.get(id);
      if (!current) {
        throw new Error(`Stage ${id} not found`);
      }
      stages.set(id, { ...current, ...patch });
      return stages.get(id) as AnalysisStageRun;
    },
    getStageRun(id: string) {
      return stages.get(id) ?? null;
    },
    getStageRunByTaskAndKey(taskId: string, stageKey: AnalysisStageRun["stageKey"]) {
      return [...stages.values()].find((stage) => stage.taskId === taskId && stage.stageKey === stageKey) ?? null;
    },
    listStageRuns(taskId: string) {
      return [...stages.values()]
        .filter((stage) => stage.taskId === taskId)
        .sort((a, b) => a.stageOrder - b.stageOrder);
    }
  };
}

function createService(overrides: {
  profile?: LlmProfile;
  secretKey?: string | null;
  getQuotes?: () => Promise<unknown[]>;
} = {}) {
  const profile = overrides.profile ?? makeProfile();
  const analysisTaskRepo = createAnalysisTaskRepoStub();

  const dataServiceClient = {
    getQuotes: vi.fn(overrides.getQuotes ?? (() => Promise.resolve([]))),
    getKline: vi.fn(() => Promise.resolve({ symbol: "000001.SZ", timeframe: "1d", adjustMode: "qfq", bars: [], updatedAt: new Date().toISOString() })),
    getNews: vi.fn(() => Promise.resolve([])),
    getEvents: vi.fn(() => Promise.resolve([])),
    getFundamentals: vi.fn(() => Promise.resolve(null)),
    getSymbolProfile: vi.fn(() => Promise.resolve(null)),
    getSymbolLinkage: vi.fn(() => Promise.resolve(null)),
    getTradingDays: vi.fn(() => Promise.resolve({ start: "2026-01-01", end: "2026-01-15", tradingDays: [] }))
  };

  const analysisRepo = {
    saveRun: vi.fn((_run: AnalysisRun, _artifact: { promptRequest: string; rawResponse: string; validationReport: string; llmProfileId: string }) => {}),
    listRecentRunsBySymbol: vi.fn(() => []),
    getRun: vi.fn(() => null)
  };

  const service = new AnalysisService({
    dataServiceClient: dataServiceClient as never,
    settingsRepo: {
      getSettings: () => makeSettings(profile)
    } as never,
    analysisRepo: analysisRepo as never,
    analysisTaskRepo: analysisTaskRepo as never,
    secretManager: {
      get: vi.fn(async () => overrides.secretKey ?? null)
    } as never
  });

  return { service, analysisTaskRepo, analysisRepo };
}

async function waitUntil(assertion: () => void, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assertion();
}

describe("AnalysisService", () => {
  it("creates a task immediately and persists all stage runs plus the final report on success", async () => {
    const { service, analysisTaskRepo, analysisRepo } = createService({ secretKey: "sk-test" });

    (service as unknown as { llmClient: { invokeStructured: ReturnType<typeof vi.fn>; testProfile: ReturnType<typeof vi.fn> } }).llmClient = {
      testProfile: vi.fn(),
      invokeStructured: vi.fn(async ({ schemaName }: { schemaName: string }) => {
        if (schemaName === "research_plan_v1") {
          return {
            result: {
              schemaVersion: "analysis.stage.research_plan.v1",
              focusAreas: ["趋势", "板块"],
              keyQuestions: ["趋势是否延续"],
              evidencePriorities: ["技术面"],
              dataGaps: [],
              recommendedExpansions: ["复盘历史观点"]
            },
            rawResponse: "{}",
            rawPayload: "{}",
            validationReport: "validation:ok",
            requestId: "req-1",
            usage: null,
            model: "mock",
            finishReason: "stop"
          };
        }

        if (schemaName === "technical_stage_v1") {
          return {
            result: {
              schemaVersion: "analysis.stage.technical.v1",
              stanceHint: "bullish",
              summary: "技术面偏强。",
              trendAssessment: "趋势向上。",
              momentumAssessment: "动能温和增强。",
              supportLevels: [10],
              resistanceLevels: [12],
              evidence: ["MA20 上方运行"]
            },
            rawResponse: "{}",
            rawPayload: "{}",
            validationReport: "validation:ok",
            requestId: "req-2",
            usage: null,
            model: "mock",
            finishReason: "stop"
          };
        }

        if (schemaName === "fundamental_event_stage_v1") {
          return {
            result: {
              schemaVersion: "analysis.stage.fundamental_event.v1",
              stanceHint: "neutral",
              summary: "基本面稳定。",
              fundamentalAssessment: "估值中性。",
              newsAssessment: "暂无重大负面新闻。",
              linkageAssessment: "板块跟随宽基。",
              evidence: ["财务指标稳定"]
            },
            rawResponse: "{}",
            rawPayload: "{}",
            validationReport: "validation:ok",
            requestId: "req-3",
            usage: null,
            model: "mock",
            finishReason: "stop"
          };
        }

        if (schemaName === "risk_challenge_stage_v1") {
          return {
            result: {
              schemaVersion: "analysis.stage.risk_challenge.v1",
              summary: "需防止回撤。",
              confidenceAdjustment: -5,
              risks: ["量能不足"],
              invalidationSignals: ["跌破 10 元支撑"],
              opposingEvidence: ["板块强度一般"]
            },
            rawResponse: "{}",
            rawPayload: "{}",
            validationReport: "validation:ok",
            requestId: "req-4",
            usage: null,
            model: "mock",
            finishReason: "stop"
          };
        }

        return {
          result: {
            schemaVersion: "analysis_report_v2",
            symbol: "000001.SZ",
            asOf: "2026-03-17T00:00:00.000Z",
            forecastWindow: "3d",
            marketRegime: {
              summary: "市场震荡偏强。",
              bullets: ["宽基指数偏强"]
            },
            stance: "bullish",
            confidence: {
              score: 72,
              rationale: "技术面与事件面共振。"
            },
            summary: ["趋势维持", "回踩可观察", "注意量能验证"],
            technicalView: {
              summary: "技术面偏强。",
              bullets: ["均线多头"]
            },
            fundamentalView: {
              summary: "基本面稳定。",
              bullets: ["估值中性"]
            },
            newsEventView: {
              summary: "事件面平稳。",
              bullets: ["暂无重大负面"]
            },
            sectorIndexLinkage: {
              industry: "银行",
              conceptBoards: ["中字头"],
              indexSnapshot: ["上证 +0.50%"],
              interpretation: "板块与指数同向。"
            },
            scenarioTree: {
              bull: {
                thesis: "放量上攻",
                probabilityLabel: "中",
                triggerSignals: ["放量突破"],
                targetChangePctRange: { low: 3, high: 8 }
              },
              base: {
                thesis: "震荡上行",
                probabilityLabel: "高",
                triggerSignals: ["量能平稳"],
                targetChangePctRange: { low: 0, high: 3 }
              },
              bear: {
                thesis: "冲高回落",
                probabilityLabel: "中低",
                triggerSignals: ["跌破支撑"],
                targetChangePctRange: { low: -6, high: 0 }
              }
            },
            riskMatrix: [
              {
                level: "medium",
                title: "量能不足",
                detail: "若无法持续放量，走势会钝化。",
                mitigation: "等待确认后加仓。"
              }
            ],
            invalidationSignals: ["跌破 10 元支撑"],
            actionPlan: {
              observationLevels: [10, 10.5],
              entryIdea: "回踩承接后观察。",
              stopLossIdea: "跌破支撑减仓。",
              takeProfitIdea: "接近压力位分批兑现。",
              positionSizingIdea: "先轻仓。",
              disclaimer: "仅供研究参考，不构成投资建议"
            },
            evidence: [
              {
                id: "ev-1",
                dimension: "technical",
                thesis: "均线多头排列。",
                refs: ["ma20"]
              }
            ],
            dataQuality: {
              sufficiency: "sufficient",
              flags: [],
              missingPieces: []
            },
            disclaimer: "仅供研究参考，不构成投资建议"
          },
          rawResponse: "{}",
          rawPayload: "{}",
          validationReport: "validation:ok",
          requestId: "req-5",
          usage: null,
          model: "mock",
          finishReason: "stop"
        };
      })
    };

    const task = await service.startTask({
      symbol: "000001.SZ",
      templateId: "quick_scan_v1",
      forecastWindow: "3d",
      llmProfileId: "profile-1"
    });

    expect(task.status).toBe("pending");

    await waitUntil(() => {
      const stored = analysisTaskRepo.getTask(task.id);
      expect(stored?.status).toBe("completed");
      expect(stored?.finalRunId).toBeTruthy();
    });

    const stages = analysisTaskRepo.listStageRuns(task.id);
    expect(stages).toHaveLength(8);
    expect(stages.every((stage) => stage.status === "completed")).toBe(true);
    expect(analysisRepo.saveRun).toHaveBeenCalledTimes(1);
  });

  it("marks tasks as failed when execution fails before the first stage starts", async () => {
    const { service, analysisTaskRepo } = createService({ secretKey: null });

    const task = await service.startTask({
      symbol: "000001.SZ",
      templateId: "quick_scan_v1",
      forecastWindow: "3d",
      llmProfileId: "profile-1"
    });

    await waitUntil(() => {
      const stored = analysisTaskRepo.getTask(task.id);
      expect(stored?.status).toBe("failed");
      expect(stored?.errorSummary).toContain("LLM API key is missing.");
    });
  });

  it("reports the live running stage in queue status instead of the enqueue-time snapshot", async () => {
    const pendingQuotes = new Promise<unknown[]>(() => {});
    const { service } = createService({
      secretKey: "sk-test",
      getQuotes: () => pendingQuotes
    });

    const task = await service.startTask({
      symbol: "000001.SZ",
      templateId: "quick_scan_v1",
      forecastWindow: "3d",
      llmProfileId: "profile-1"
    });

    await waitUntil(() => {
      const queue = service.getQueueStatus();
      expect(queue.running?.id).toBe(task.id);
      expect(queue.running?.status).toBe("running");
      expect(queue.running?.stageKey).toBe("snapshot_collect");
    });
  });
});
