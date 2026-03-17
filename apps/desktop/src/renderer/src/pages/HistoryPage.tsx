import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, Input } from "@fluentui/react-components";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisStageKey, AnalysisTaskStatus } from "@stockdesk/shared";
import styles from "./HistoryPage.module.css";

function toDateStartIso(value: string) {
  return value ? dayjs(`${value}T00:00:00`).toISOString() : undefined;
}

function toDateEndIso(value: string) {
  return value ? dayjs(`${value}T23:59:59.999`).toISOString() : undefined;
}

const stageLabels: Record<AnalysisStageKey, string> = {
  snapshot_collect: "研究快照收集",
  research_plan: "研究计划",
  evidence_expand: "证据扩展",
  technical_analysis: "技术分析",
  fundamental_event_analysis: "财务与事件分析",
  risk_challenge: "风险挑战",
  final_report: "最终报告",
  validate_and_persist: "校验与持久化"
};

function taskStatusLabel(status: AnalysisTaskStatus) {
  if (status === "pending") {
    return "等待执行";
  }
  if (status === "running") {
    return "进行中";
  }
  if (status === "completed") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  return "已取消";
}

function templateLabel(templateId: "quick_scan_v1" | "technical_swing_v1") {
  return templateId === "quick_scan_v1" ? "quick_scan_v1 · 快速看盘" : "technical_swing_v1 · 技术面主导";
}

export function HistoryPage() {
  const [symbolFilter, setSymbolFilter] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const startIso = toDateStartIso(startDate);
  const endIso = toDateEndIso(endDate);

  const query = useQuery({
    queryKey: ["analysisRuns", startIso, endIso],
    queryFn: () => window.stockdesk.analysis.listTasks({ limit: 200 })
  });

  const tasks = query.data ?? [];
  const filteredTasks = useMemo(
    () => tasks.filter((task) => {
      const createdAt = task.completedAt ?? task.failedAt ?? task.createdAt;
      const symbolMatch = symbolFilter.trim().length === 0 || task.symbol.toLowerCase().includes(symbolFilter.trim().toLowerCase());
      const templateMatch = templateFilter === "all" || task.templateId === templateFilter;
      const startMatch = !startIso || createdAt >= startIso;
      const endMatch = !endIso || createdAt <= endIso;
      return symbolMatch && templateMatch && startMatch && endMatch;
    }),
    [endIso, startIso, symbolFilter, tasks, templateFilter]
  );

  useEffect(() => {
    if (filteredTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].id);
    }
  }, [filteredTasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.id === selectedTaskId) ?? null,
    [filteredTasks, selectedTaskId]
  );

  const stagesQuery = useQuery({
    queryKey: ["analysisTaskStages", selectedTaskId],
    queryFn: () => window.stockdesk.analysis.getTaskStages(selectedTaskId as string),
    enabled: Boolean(selectedTaskId)
  });

  const detailQuery = useQuery({
    queryKey: ["analysisRun", selectedTask?.finalRunId],
    queryFn: () => window.stockdesk.analysis.getRun(selectedTask?.finalRunId as string),
    enabled: Boolean(selectedTask?.finalRunId)
  });

  const exportMutation = useMutation({
    mutationFn: async (format: "markdown" | "pdf") => {
      const exportableRunIds = filteredTasks
        .map((task) => task.finalRunId)
        .filter((runId): runId is string => Boolean(runId));

      if (exportableRunIds.length === 0) {
        throw new Error("当前筛选条件下没有可导出的完成报告。");
      }

      const path = await window.stockdesk.system.pickExportPath(format);
      if (!path) {
        return null;
      }

      return window.stockdesk.analysis.exportRuns({
        path,
        format,
        runIds: exportableRunIds
      });
    },
    onSuccess: (result) => {
      if (!result) {
        return;
      }
      setFeedback(`导出完成：${result.exportedCount} 条记录，格式 ${result.format}。`);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "导出失败。");
    }
  });

  const isGlobalEmpty = tasks.length === 0 && !startDate && !endDate;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Badge appearance="filled" color="informative">
          Research Vault
        </Badge>
        <span>Research Vault</span>
        <h2>分析记录与观点时间线</h2>
      </header>

      {isGlobalEmpty ? (
        <section className={styles.emptyState}>
          <h3>你还没有分析记录</h3>
          <p>去自选页选择股票，然后点击“分析”或“批量分析”生成第一条记录。</p>
          <Link to="/">去自选页分析</Link>
        </section>
      ) : (
        <>
          <div className={styles.filters}>
            <Input placeholder="筛选股票代码，如 000001.SZ" value={symbolFilter} onChange={(_, data) => setSymbolFilter(data.value)} />
            <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}>
              <option value="all">全部模板</option>
              <option value="quick_scan_v1">quick_scan_v1</option>
              <option value="technical_swing_v1">technical_swing_v1</option>
            </select>
            <label className={styles.dateField}>
              <span>起始日期</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className={styles.dateField}>
              <span>结束日期</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <Button
              appearance="secondary"
              type="button"
              className={styles.clearButton}
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              清空时间范围
            </Button>
            <span className={styles.count}>共 {filteredTasks.length} 条任务</span>
          </div>

          <div className={styles.exportBar}>
            <Button appearance="primary" type="button" onClick={() => exportMutation.mutate("markdown")} disabled={exportMutation.isPending || filteredTasks.every((task) => !task.finalRunId)}>
              导出 Markdown
            </Button>
            <Button appearance="secondary" type="button" onClick={() => exportMutation.mutate("pdf")} disabled={exportMutation.isPending || filteredTasks.every((task) => !task.finalRunId)}>
              导出 PDF
            </Button>
            {feedback ? <span>{feedback}</span> : null}
          </div>

          <div className={styles.layout}>
            <div className={styles.list}>
              {filteredTasks.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className={`${styles.card} ${selectedTaskId === task.id ? styles.active : ""}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className={styles.rowTop}>
                    <strong>{task.symbol}</strong>
                    <small>{dayjs(task.createdAt).format("MM-DD HH:mm")}</small>
                  </div>
                  <p>{task.errorSummary ?? (task.currentStageKey ? `${stageLabels[task.currentStageKey]} · ${taskStatusLabel(task.status)}` : taskStatusLabel(task.status))}</p>
                  <small className={styles.statusRow}>
                    {templateLabel(task.templateId)} · {taskStatusLabel(task.status)} · {task.finalRunId ? "已生成报告" : "无最终报告"}
                  </small>
                </button>
              ))}
              {filteredTasks.length === 0 ? <div className={styles.emptyList}>当前过滤条件下没有任务。</div> : null}
            </div>

            <div className={styles.detail}>
              {detailQuery.isPending ? <p className={styles.hint}>正在加载记录详情...</p> : null}
              {detailQuery.error ? <p className={styles.error}>{detailQuery.error instanceof Error ? detailQuery.error.message : "记录详情加载失败"}</p> : null}
              {selectedTask ? (
                <>
                  <div className={styles.detailHead}>
                    <div>
                      <h3>{selectedTask.symbol}</h3>
                      <span>{dayjs(selectedTask.createdAt).format("YYYY-MM-DD HH:mm:ss")} · {taskStatusLabel(selectedTask.status)}</span>
                    </div>
                    <Link to={`/symbol/${selectedTask.symbol}`}>打开个股详情</Link>
                  </div>

                  {detailQuery.data ? (
                    <>
                      <div className={styles.section}>
                        <h4>结论摘要</h4>
                        <ul>
                          {detailQuery.data.result.summary.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>

                      <div className={styles.section}>
                        <h4>市场、技术与事件</h4>
                        <p>{detailQuery.data.result.marketRegime.summary}</p>
                        <ul>
                          {detailQuery.data.result.technicalView.bullets.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        <p>{detailQuery.data.result.fundamentalView.summary}</p>
                        <p>{detailQuery.data.result.newsEventView.summary}</p>
                      </div>

                      <div className={styles.section}>
                        <h4>反证条件</h4>
                        <ul>
                          {detailQuery.data.result.invalidationSignals.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>

                      <div className={styles.section}>
                        <h4>主要风险</h4>
                        <ul>
                          {detailQuery.data.result.riskMatrix.map((risk) => (
                            <li key={`${risk.title}-${risk.level}`}>{risk.title} · {risk.detail}</li>
                          ))}
                        </ul>
                      </div>

                      <div className={styles.section}>
                        <h4>行动计划</h4>
                        <p>观察价位：{detailQuery.data.result.actionPlan.observationLevels.join(" / ") || "--"}</p>
                        <p>入场：{detailQuery.data.result.actionPlan.entryIdea}</p>
                        <p>止损：{detailQuery.data.result.actionPlan.stopLossIdea}</p>
                        <p>止盈：{detailQuery.data.result.actionPlan.takeProfitIdea}</p>
                      </div>
                    </>
                  ) : (
                    <div className={styles.section}>
                      <h4>报告状态</h4>
                      <p>{selectedTask.errorSummary ?? "当前任务还没有最终报告。"}</p>
                    </div>
                  )}

                  <div className={styles.section}>
                    <h4>阶段轨迹</h4>
                    <div className={styles.timeline}>
                      {(stagesQuery.data ?? []).map((stage) => (
                        <div key={stage.id} className={styles.timelineItem}>
                          <div className={styles.rowTop}>
                            <strong>{stage.title}</strong>
                            <small>{taskStatusLabel(stage.status)}</small>
                          </div>
                          <p>{stage.summary || "阶段尚未输出摘要。"}</p>
                          <small>
                            {stage.startedAt ? dayjs(stage.startedAt).format("MM-DD HH:mm:ss") : "--"}
                            {" → "}
                            {stage.completedAt ? dayjs(stage.completedAt).format("MM-DD HH:mm:ss") : "--"}
                          </small>
                        </div>
                      ))}
                      {(stagesQuery.data?.length ?? 0) === 0 ? <p className={styles.hint}>当前任务还没有阶段轨迹。</p> : null}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
