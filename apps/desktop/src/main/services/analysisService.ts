import { buildFeaturePack, buildSystemPrompt, buildUserPrompt } from "@stockdesk/analysis-core";
import { AnalysisRepo, SettingsRepo } from "@stockdesk/db";
import {
  nowIso,
  type AnalysisQueueItem,
  type AnalysisQueueStatus,
  type AnalysisRun,
  type AnalysisRunInput,
  type ForecastWindow,
  type LlmProfile,
  type SymbolId
} from "@stockdesk/shared";
import { DataServiceClient } from "./dataServiceClient";
import { LlmClient } from "./llmClient";
import { SecretManager } from "./secretManager";

interface QueueTask {
  queueItem: AnalysisQueueItem;
  input: AnalysisRunInput;
  resolve(value: AnalysisRun): void;
  reject(reason?: unknown): void;
}

function summaryFromMarket(symbol: SymbolId, window: ForecastWindow) {
  return [
    `标的 ${symbol} 当前分析窗口为 ${window}。`,
    "市场摘要首版未接入宽基指数强弱对比，结论更依赖个股特征与事件输入。",
    "若数据质量标记较多，应降低置信度并优先观察反证条件。"
  ];
}

export class AnalysisService {
  private readonly llmClient = new LlmClient();
  private readonly queue: QueueTask[] = [];
  private running: QueueTask | null = null;
  private updatedAt = nowIso();

  constructor(
    private readonly deps: {
      dataServiceClient: DataServiceClient;
      settingsRepo: SettingsRepo;
      analysisRepo: AnalysisRepo;
      secretManager: SecretManager;
    }
  ) {}

  async enqueue(input: AnalysisRunInput): Promise<AnalysisRun> {
    const queueItem: AnalysisQueueItem = {
      id: crypto.randomUUID(),
      symbol: input.symbol,
      templateId: input.templateId,
      forecastWindow: input.forecastWindow,
      enqueuedAt: nowIso()
    };

    return new Promise<AnalysisRun>((resolve, reject) => {
      this.queue.push({ queueItem, input, resolve, reject });
      this.updatedAt = nowIso();
      void this.processQueue();
    });
  }

  getQueueStatus(): AnalysisQueueStatus {
    return {
      running: this.running?.queueItem ?? null,
      pending: this.queue.map((task) => task.queueItem),
      totalPending: this.queue.length,
      updatedAt: this.updatedAt
    };
  }

  private async processQueue() {
    if (this.running || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.running = task;
    this.updatedAt = nowIso();

    try {
      const result = await this.runNow(task.input);
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.running = null;
      this.updatedAt = nowIso();
      void this.processQueue();
    }
  }

  private async runNow(input: AnalysisRunInput): Promise<AnalysisRun> {
    const settings = this.deps.settingsRepo.getSettings();
    const profile = settings?.llmProfiles.find((item) => item.id === input.llmProfileId);
    if (!profile) {
      throw new Error("LLM profile not found.");
    }

    const apiKey = await this.deps.secretManager.get(profile.id);
    if (!apiKey) {
      throw new Error("LLM API key is missing.");
    }

    const quote = (await this.deps.dataServiceClient.getQuotes([input.symbol]))[0] ?? null;
    const daily = await this.deps.dataServiceClient.getKline({
      symbol: input.symbol,
      timeframe: "1d",
      adjustMode: "qfq"
    });
    const intraday = await this.deps.dataServiceClient.getKline({
      symbol: input.symbol,
      timeframe: "1m",
      adjustMode: "none"
    });
    const news = await this.deps.dataServiceClient.getNews(input.symbol, { limit: 8 });
    const events = await this.deps.dataServiceClient.getEvents(input.symbol, { limit: 8 });
    const featurePack = buildFeaturePack({
      symbol: input.symbol,
      quote,
      dailyBars: daily.bars,
      intradayBars: intraday.bars,
      news,
      events,
      marketSummary: summaryFromMarket(input.symbol, input.forecastWindow)
    });

    const systemPrompt = buildSystemPrompt(input.templateId);
    const userPrompt = buildUserPrompt({
      templateId: input.templateId,
      forecastWindow: input.forecastWindow,
      featurePack
    });
    const llm = await this.llmClient.analyze({
      profile,
      apiKey,
      systemPrompt,
      userPrompt
    });

    const createdAt = nowIso();
    const run: AnalysisRun = {
      id: crypto.randomUUID(),
      symbol: input.symbol,
      templateId: input.templateId,
      stance: llm.result.stance,
      confidenceScore: llm.result.confidence.score,
      forecastWindow: input.forecastWindow,
      createdAt,
      summary: llm.result.summaryLines.join(" "),
      result: llm.result,
      featurePack
    };

    this.deps.analysisRepo.saveRun(run, {
      promptRequest: JSON.stringify({
        profile,
        systemPrompt,
        userPrompt
      }),
      rawResponse: llm.rawResponse,
      validationReport: llm.validationReport,
      llmProfileId: profile.id
    });

    return run;
  }

  async testProfile(profile: LlmProfile) {
    const apiKey = await this.deps.secretManager.get(profile.id);
    if (!apiKey) {
      throw new Error("API key missing.");
    }

    const response = await fetch(new URL("/models", profile.baseUrl).toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    if (!response.ok) {
      throw new Error(`LLM profile test failed with ${response.status}`);
    }
  }
}
