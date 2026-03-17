import { and, desc, eq } from "drizzle-orm";
import type { AnalysisStageRun, AnalysisTaskDetail, AnalysisTaskStatus, AnalysisTaskSummary } from "@stockdesk/shared";
import { analysisStageRuns, analysisTasks } from "../schema/tables";
import type { StockdeskDb } from "../database";

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function toTask(row: typeof analysisTasks.$inferSelect): AnalysisTaskDetail {
  return {
    id: row.id,
    symbol: row.symbol as AnalysisTaskDetail["symbol"],
    workflowId: row.workflowId as AnalysisTaskDetail["workflowId"],
    templateId: row.templateId as AnalysisTaskDetail["templateId"],
    llmProfileId: row.llmProfileId,
    protocol: row.protocol as AnalysisTaskDetail["protocol"],
    status: row.status as AnalysisTaskDetail["status"],
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    errorSummary: row.errorSummary,
    finalRunId: row.finalRunId,
    currentStageKey: row.currentStageKey as AnalysisTaskDetail["currentStageKey"],
    currentStageStatus: row.currentStageStatus as AnalysisTaskDetail["currentStageStatus"]
  };
}

function toStageRun(row: typeof analysisStageRuns.$inferSelect): AnalysisStageRun {
  return {
    id: row.id,
    taskId: row.taskId,
    stageKey: row.stageKey as AnalysisStageRun["stageKey"],
    stageOrder: row.stageOrder,
    actorKind: row.actorKind as AnalysisStageRun["actorKind"],
    status: row.status as AnalysisStageRun["status"],
    model: row.model,
    title: row.title,
    summary: row.summary,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    structuredInput: parseJsonRecord(row.inputPayload),
    structuredOutput: parseJsonRecord(row.outputPayload),
    rawPayloadRef: row.rawPayload,
    usage: parseJsonRecord(row.usagePayload),
    errorSummary: row.errorSummary
  };
}

export class AnalysisTaskRepo {
  constructor(private readonly db: StockdeskDb) {}

  createTask(task: typeof analysisTasks.$inferInsert): AnalysisTaskDetail {
    this.db.insert(analysisTasks).values(task).run();
    return this.getTask(task.id) as AnalysisTaskDetail;
  }

  createTaskWithStageRuns(
    task: typeof analysisTasks.$inferInsert,
    stageRuns: Array<typeof analysisStageRuns.$inferInsert>
  ): AnalysisTaskDetail {
    this.db.transaction((tx) => {
      tx.insert(analysisTasks).values(task).run();
      if (stageRuns.length > 0) {
        tx.insert(analysisStageRuns).values(stageRuns).run();
      }
    });
    return this.getTask(task.id) as AnalysisTaskDetail;
  }

  updateTask(
    id: string,
    patch: Partial<typeof analysisTasks.$inferInsert>
  ): AnalysisTaskDetail {
    this.db.update(analysisTasks).set(patch).where(eq(analysisTasks.id, id)).run();
    return this.getTask(id) as AnalysisTaskDetail;
  }

  getTask(id: string): AnalysisTaskDetail | null {
    const row = this.db.select().from(analysisTasks).where(eq(analysisTasks.id, id)).get();
    return row ? toTask(row) : null;
  }

  listTasks(filter?: { symbol?: string; status?: AnalysisTaskStatus; limit?: number }): AnalysisTaskSummary[] {
    const limit = filter?.limit ?? 100;
    const where =
      filter?.symbol && filter?.status
        ? and(eq(analysisTasks.symbol, filter.symbol), eq(analysisTasks.status, filter.status))
        : filter?.symbol
          ? eq(analysisTasks.symbol, filter.symbol)
          : filter?.status
            ? eq(analysisTasks.status, filter.status)
            : undefined;

    const query = this.db
      .select()
      .from(analysisTasks)
      .orderBy(desc(analysisTasks.createdAt))
      .limit(limit);

    const rows = where ? query.where(where).all() : query.all();
    return rows.map(toTask);
  }

  createStageRun(stageRun: typeof analysisStageRuns.$inferInsert): AnalysisStageRun {
    this.db.insert(analysisStageRuns).values(stageRun).run();
    return this.getStageRun(stageRun.id) as AnalysisStageRun;
  }

  updateStageRun(
    id: string,
    patch: Partial<typeof analysisStageRuns.$inferInsert>
  ): AnalysisStageRun {
    this.db.update(analysisStageRuns).set(patch).where(eq(analysisStageRuns.id, id)).run();
    return this.getStageRun(id) as AnalysisStageRun;
  }

  getStageRun(id: string): AnalysisStageRun | null {
    const row = this.db.select().from(analysisStageRuns).where(eq(analysisStageRuns.id, id)).get();
    return row ? toStageRun(row) : null;
  }

  getStageRunByTaskAndKey(taskId: string, stageKey: AnalysisStageRun["stageKey"]): AnalysisStageRun | null {
    const row = this.db
      .select()
      .from(analysisStageRuns)
      .where(and(eq(analysisStageRuns.taskId, taskId), eq(analysisStageRuns.stageKey, stageKey)))
      .get();
    return row ? toStageRun(row) : null;
  }

  listStageRuns(taskId: string): AnalysisStageRun[] {
    return this.db
      .select()
      .from(analysisStageRuns)
      .where(eq(analysisStageRuns.taskId, taskId))
      .all()
      .sort((a, b) => a.stageOrder - b.stageOrder)
      .map(toStageRun);
  }
}
