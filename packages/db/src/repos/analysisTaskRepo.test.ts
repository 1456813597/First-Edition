import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../database";
import { AnalysisTaskRepo } from "./analysisTaskRepo";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe("AnalysisTaskRepo", () => {
  it("rolls back task creation when initial stage inserts fail", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "stockdesk-db-"));
    tempDirs.push(dir);

    const { db, sqlite } = createDatabase(path.join(dir, "test.db"));
    const repo = new AnalysisTaskRepo(db);

    expect(() =>
      repo.createTaskWithStageRuns(
        {
          id: "task-1",
          symbol: "000001.SZ",
          workflowId: "stock_research_v1",
          templateId: "quick_scan_v1",
          llmProfileId: "profile-1",
          protocol: "openai_chat_compatible",
          status: "pending",
          createdAt: "2026-03-17T00:00:00.000Z",
          startedAt: null,
          completedAt: null,
          failedAt: null,
          errorSummary: null,
          finalRunId: null,
          currentStageKey: null,
          currentStageStatus: null
        },
        [
          {
            id: "stage-dup",
            taskId: "task-1",
            stageKey: "snapshot_collect",
            stageOrder: 1,
            actorKind: "host",
            status: "pending",
            model: null,
            title: "研究快照收集",
            summary: "",
            startedAt: null,
            completedAt: null,
            inputPayload: null,
            outputPayload: null,
            rawPayload: null,
            usagePayload: null,
            errorSummary: null
          },
          {
            id: "stage-dup",
            taskId: "task-1",
            stageKey: "research_plan",
            stageOrder: 2,
            actorKind: "llm",
            status: "pending",
            model: null,
            title: "研究计划",
            summary: "",
            startedAt: null,
            completedAt: null,
            inputPayload: null,
            outputPayload: null,
            rawPayload: null,
            usagePayload: null,
            errorSummary: null
          }
        ]
      )
    ).toThrow();

    expect(repo.getTask("task-1")).toBeNull();
    expect(repo.listStageRuns("task-1")).toHaveLength(0);
    sqlite.close();
  });
});
