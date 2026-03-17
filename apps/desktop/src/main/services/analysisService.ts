import { AnalysisRepo, AnalysisTaskRepo, SettingsRepo } from "@stockdesk/db";
import {
  nowIso,
  type AnalysisQueueItem,
  type AnalysisQueueStatus,
  type AnalysisRun,
  type AnalysisRunInput,
  type AnalysisStartTaskInput,
  type AnalysisTaskStatus,
  type AnalysisTaskSummary,
  type LlmProbeMode,
  type LlmProfile
} from "@stockdesk/shared";
import { DataServiceClient } from "./dataServiceClient";
import { LlmClient } from "./llmClient";
import { ANALYSIS_STAGES, ANALYSIS_WORKFLOW_ID, AnalysisWorkflowRunner, type QueueTask } from "./analysisWorkflowRunner";
import { SecretManager } from "./secretManager";

interface Waiter {
  resolve(value: AnalysisRun): void;
  reject(reason?: unknown): void;
}

function taskQueueItem(task: AnalysisTaskSummary): AnalysisQueueItem {
  return {
    id: task.id,
    symbol: task.symbol,
    templateId: task.templateId,
    workflowId: task.workflowId,
    stageKey: task.currentStageKey,
    status: task.status,
    enqueuedAt: task.createdAt
  };
}

export class AnalysisService {
  private readonly llmClient = new LlmClient();
  private readonly queue: QueueTask[] = [];
  private readonly waiters = new Map<string, Waiter>();
  private readonly workflowRunner: AnalysisWorkflowRunner;
  private running: QueueTask | null = null;
  private updatedAt = nowIso();

  constructor(
    private readonly deps: {
      dataServiceClient: DataServiceClient;
      settingsRepo: SettingsRepo;
      analysisRepo: AnalysisRepo;
      analysisTaskRepo: AnalysisTaskRepo;
      secretManager: SecretManager;
    }
  ) {
    this.workflowRunner = new AnalysisWorkflowRunner({
      dataServiceClient: deps.dataServiceClient,
      analysisRepo: deps.analysisRepo,
      analysisTaskRepo: deps.analysisTaskRepo
    });
  }

  private resolveProfile(input: AnalysisRunInput): LlmProfile {
    const settings = this.deps.settingsRepo.getSettings();
    const profile = settings?.llmProfiles.find((item) => item.id === input.llmProfileId) ?? null;
    if (!profile) {
      throw new Error("LLM profile not found.");
    }
    return profile;
  }

  async startTask(input: AnalysisStartTaskInput): Promise<AnalysisTaskSummary> {
    return this.createTask(input);
  }

  async enqueue(input: AnalysisRunInput): Promise<AnalysisRun> {
    const task = await this.createTask(input, true);
    return new Promise<AnalysisRun>((resolve, reject) => {
      this.waiters.set(task.id, { resolve, reject });
    });
  }

  listTasks(filter?: { symbol?: string; status?: AnalysisTaskStatus; limit?: number }) {
    return this.deps.analysisTaskRepo.listTasks(filter);
  }

  getTask(id: string) {
    return this.deps.analysisTaskRepo.getTask(id);
  }

  getTaskStages(taskId: string) {
    return this.deps.analysisTaskRepo.listStageRuns(taskId);
  }

  cancelTask(id: string) {
    const queuedIndex = this.queue.findIndex((item) => item.taskId === id);
    if (queuedIndex < 0) {
      throw new Error("Only pending tasks can be cancelled.");
    }
    this.queue.splice(queuedIndex, 1);
    this.updatedAt = nowIso();
    return this.deps.analysisTaskRepo.updateTask(id, {
      status: "cancelled",
      completedAt: nowIso(),
      errorSummary: "Task cancelled before execution.",
      currentStageKey: null,
      currentStageStatus: "cancelled"
    });
  }

  getQueueStatus(): AnalysisQueueStatus {
    const runningTask = this.running ? this.deps.analysisTaskRepo.getTask(this.running.taskId) : null;
    return {
      running: runningTask ? taskQueueItem(runningTask) : null,
      pending: this.queue
        .map((task) => this.deps.analysisTaskRepo.getTask(task.taskId))
        .filter((task): task is AnalysisTaskSummary => Boolean(task))
        .map(taskQueueItem),
      totalPending: this.queue.length,
      updatedAt: this.updatedAt
    };
  }

  async testProfile(profile: LlmProfile, probeMode: LlmProbeMode = "models_then_minimal") {
    const apiKey = await this.deps.secretManager.get(profile.id);
    if (!apiKey) {
      throw new Error("API key missing.");
    }
    await this.llmClient.testProfile(profile, apiKey, probeMode);
  }

  private async createTask(input: AnalysisStartTaskInput, preserveShim = false): Promise<AnalysisTaskSummary> {
    if (input.workflowId && input.workflowId !== ANALYSIS_WORKFLOW_ID) {
      throw new Error(`Unsupported workflowId: ${input.workflowId}`);
    }

    const profile = this.resolveProfile(input);
    const createdAt = nowIso();
    const workflowId = input.workflowId ?? ANALYSIS_WORKFLOW_ID;
    const taskId = crypto.randomUUID();
    const task = this.deps.analysisTaskRepo.createTaskWithStageRuns({
      id: taskId,
      symbol: input.symbol,
      workflowId,
      templateId: input.templateId,
      llmProfileId: input.llmProfileId,
      protocol: profile.protocol,
      status: "pending",
      createdAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorSummary: null,
      finalRunId: null,
      currentStageKey: null,
      currentStageStatus: null
    }, ANALYSIS_STAGES.map((stage) => ({
      id: crypto.randomUUID(),
      taskId,
      stageKey: stage.key,
      stageOrder: stage.order,
      actorKind: stage.actorKind,
      status: "pending",
      model: null,
      title: stage.title,
      summary: "",
      startedAt: null,
      completedAt: null,
      inputPayload: null,
      outputPayload: null,
      rawPayload: null,
      usagePayload: null,
      errorSummary: null
    })));

    this.queue.push({
      taskId: task.id,
      input: {
        ...input,
        workflowId
      }
    });
    this.updatedAt = nowIso();
    if (!preserveShim) {
      void this.processQueue();
    } else {
      queueMicrotask(() => {
        void this.processQueue();
      });
    }
    return task;
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
      const profile = this.resolveProfile(task.input);
      const apiKey = await this.deps.secretManager.get(profile.id);
      if (!apiKey) {
        throw new Error("LLM API key is missing.");
      }

      const result = await this.workflowRunner.runTask(task, profile, apiKey, this.llmClient);
      const waiter = this.waiters.get(task.taskId);
      if (waiter) {
        waiter.resolve(result);
        this.waiters.delete(task.taskId);
      }
    } catch (error) {
      this.markTaskFailed(task.taskId, error);
      const waiter = this.waiters.get(task.taskId);
      if (waiter) {
        waiter.reject(error);
        this.waiters.delete(task.taskId);
      }
    } finally {
      this.running = null;
      this.updatedAt = nowIso();
      void this.processQueue();
    }
  }

  private markTaskFailed(taskId: string, error: unknown) {
    const task = this.deps.analysisTaskRepo.getTask(taskId);
    if (!task || task.status === "failed" || task.status === "cancelled" || task.status === "completed") {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.deps.analysisTaskRepo.updateTask(taskId, {
      status: "failed",
      failedAt: task.failedAt ?? nowIso(),
      errorSummary: message,
      currentStageStatus: "failed"
    });
  }
}
