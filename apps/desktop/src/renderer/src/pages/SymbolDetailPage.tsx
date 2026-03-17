import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@fluentui/react-components";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { AlertRuleType, AnalysisStageKey, AnalysisTaskStatus, LinkageSnapshot, QuoteSnapshot } from "@stockdesk/shared";
import { PriceChart } from "@/components/PriceChart";
import { StatCard } from "@/components/StatCard";
import styles from "./SymbolDetailPage.module.css";

type DetailTab = "analysis" | "news" | "events" | "financial" | "alerts";

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: "analysis", label: "分析" },
  { id: "news", label: "新闻" },
  { id: "events", label: "事件" },
  { id: "financial", label: "财务" },
  { id: "alerts", label: "提醒" }
];

function queueMessage(queue: Awaited<ReturnType<typeof window.stockdesk.analysis.getQueueStatus>> | undefined, symbol: string | undefined) {
  if (!symbol) {
    return "未选择股票";
  }
  if (!queue) {
    return "队列状态同步中";
  }

  if (queue.running?.symbol === symbol) {
    return `进行中：${queue.running.templateId}`;
  }

  const pendingForSymbol = queue.pending.filter((item) => item.symbol === symbol);
  if (pendingForSymbol.length > 0) {
    return `排队中：${pendingForSymbol.length} 个任务`;
  }

  if (queue.totalPending > 0) {
    return `队列繁忙：前方 ${queue.totalPending} 个任务`;
  }

  return "队列空闲";
}

function alertNameByType(type: AlertRuleType) {
  if (type === "price_below_ma20") {
    return "跌破20日线提醒";
  }
  if (type === "volume_breakout") {
    return "放量突破提醒";
  }
  if (type === "limit_up_open") {
    return "涨停打开提醒";
  }
  if (type === "price_above") {
    return "价格上穿提醒";
  }
  return "价格下穿提醒";
}

function formatMetric(value: number | null | undefined, suffix = "", digits = 2) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function formatMarketCap(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(2)}亿`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(2)}万`;
  }
  return value.toFixed(0);
}

function renderSignedPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function linkageAccent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return styles.metaMuted;
  }
  return value >= 0 ? styles.rise : styles.fall;
}

function boardSummary(snapshot: LinkageSnapshot | null | undefined) {
  if (!snapshot) {
    return "暂无联动数据";
  }
  return [
    snapshot.latest != null ? `最新 ${snapshot.latest.toFixed(2)}` : null,
    snapshot.changePct != null ? `涨跌 ${renderSignedPercent(snapshot.changePct)}` : null,
    snapshot.leadingStock ? `领涨 ${snapshot.leadingStock}` : null
  ]
    .filter(Boolean)
    .join(" · ");
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

function taskStatusClass(status: AnalysisTaskStatus) {
  if (status === "completed") {
    return styles.statusSuccess;
  }
  if (status === "failed" || status === "cancelled") {
    return styles.statusDanger;
  }
  if (status === "running") {
    return styles.statusInfo;
  }
  return styles.statusMuted;
}

function templateLabel(templateId: "quick_scan_v1" | "technical_swing_v1") {
  return templateId === "quick_scan_v1" ? "快速看盘" : "技术面主导";
}

export function SymbolDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>("analysis");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [queuedTemplate, setQueuedTemplate] = useState<"quick_scan_v1" | "technical_swing_v1" | null>(null);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.stockdesk.settings.get()
  });
  const quoteQuery = useQuery({
    queryKey: ["quote", symbol],
    queryFn: async () => (await window.stockdesk.market.getQuotes([symbol as string]))[0],
    refetchInterval: 5000,
    enabled: Boolean(symbol)
  });
  const klineQuery = useQuery({
    queryKey: ["kline", symbol],
    queryFn: () =>
      window.stockdesk.market.getKline({
        symbol: symbol as string,
        timeframe: "1d",
        adjustMode: "qfq",
        start: dayjs().subtract(2, "year").format("YYYY-MM-DD")
      }),
    enabled: Boolean(symbol),
    refetchInterval: (query) => (((query.state.data as { bars?: unknown[] } | undefined)?.bars?.length ?? 0) === 0 ? 15000 : false)
  });
  const newsQuery = useQuery({
    queryKey: ["news", symbol],
    queryFn: () => window.stockdesk.market.getNews({ symbol: symbol as string, limit: 12 }),
    enabled: Boolean(symbol)
  });
  const eventsQuery = useQuery({
    queryKey: ["events", symbol],
    queryFn: () => window.stockdesk.market.getEvents({ symbol: symbol as string, limit: 12 }),
    enabled: Boolean(symbol)
  });
  const fundamentalsQuery = useQuery({
    queryKey: ["fundamentals", symbol],
    queryFn: () => window.stockdesk.market.getFundamentals(symbol as string),
    enabled: Boolean(symbol),
    refetchInterval: 60000
  });
  const profileQuery = useQuery({
    queryKey: ["symbolProfile", symbol],
    queryFn: () => window.stockdesk.market.getSymbolProfile(symbol as string),
    enabled: Boolean(symbol),
    staleTime: 300000
  });
  const linkageQuery = useQuery({
    queryKey: ["symbolLinkage", symbol],
    queryFn: () => window.stockdesk.market.getSymbolLinkage(symbol as string),
    enabled: Boolean(symbol),
    staleTime: 60000
  });
  const tasksQuery = useQuery({
    queryKey: ["analysisTasks", symbol],
    queryFn: () => window.stockdesk.analysis.listTasks({ symbol, limit: 20 }),
    enabled: Boolean(symbol),
    refetchInterval: (query) =>
      ((query.state.data as Awaited<ReturnType<typeof window.stockdesk.analysis.listTasks>> | undefined) ?? []).some((task) => task.status === "pending" || task.status === "running")
        ? 1500
        : false
  });
  const queueQuery = useQuery({
    queryKey: ["analysisQueueStatus"],
    queryFn: () => window.stockdesk.analysis.getQueueStatus(),
    refetchInterval: 1000
  });
  const alertRulesQuery = useQuery({
    queryKey: ["alertRules", symbol],
    queryFn: () => window.stockdesk.alerts.listRules({ symbol }),
    enabled: Boolean(symbol),
    refetchInterval: 5000
  });
  const alertEventsQuery = useQuery({
    queryKey: ["alertEvents", symbol],
    queryFn: () => window.stockdesk.alerts.listEvents({ symbol, limit: 20 }),
    enabled: Boolean(symbol),
    refetchInterval: 5000
  });

  useEffect(() => {
    const firstTaskId = (tasksQuery.data ?? [])[0]?.id ?? null;
    if (firstTaskId && (!selectedTaskId || !(tasksQuery.data ?? []).some((item) => item.id === selectedTaskId))) {
      setSelectedTaskId(firstTaskId);
    }
  }, [selectedTaskId, tasksQuery.data]);

  const selectedTask = useMemo(
    () => (tasksQuery.data ?? []).find((item) => item.id === selectedTaskId) ?? null,
    [selectedTaskId, tasksQuery.data]
  );

  const taskStagesQuery = useQuery({
    queryKey: ["analysisTaskStages", selectedTaskId],
    queryFn: () => window.stockdesk.analysis.getTaskStages(selectedTaskId as string),
    enabled: Boolean(selectedTaskId),
    refetchInterval: selectedTask?.status === "pending" || selectedTask?.status === "running" ? 1500 : false
  });

  const runDetailQuery = useQuery({
    queryKey: ["analysisRun", selectedTask?.finalRunId],
    queryFn: () => window.stockdesk.analysis.getRun(selectedTask?.finalRunId as string),
    enabled: Boolean(selectedTask?.finalRunId)
  });

  const runAnalysis = useMutation({
    mutationFn: (templateId: "quick_scan_v1" | "technical_swing_v1") =>
      window.stockdesk.analysis.startTask({
        symbol: symbol as string,
        templateId,
        forecastWindow: templateId === "quick_scan_v1" ? "3d" : "10d",
        llmProfileId: settingsQuery.data?.activeLlmProfileId ?? ""
      }),
    onMutate: (templateId) => {
      setQueuedTemplate(templateId);
      setActiveTab("analysis");
    },
    onSuccess: async (task) => {
      setSelectedTaskId(task.id);
      await queryClient.invalidateQueries({ queryKey: ["analysisTasks", symbol] });
      await queryClient.invalidateQueries({ queryKey: ["analysisQueueStatus"] });
    },
    onSettled: () => {
      setQueuedTemplate(null);
    }
  });

  const cancelTaskMutation = useMutation({
    mutationFn: async (taskId: string) => window.stockdesk.analysis.cancelTask(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["analysisTasks", symbol] });
      await queryClient.invalidateQueries({ queryKey: ["analysisQueueStatus"] });
    }
  });

  const addAlertMutation = useMutation({
    mutationFn: async (type: AlertRuleType) => {
      if (!symbol) {
        throw new Error("无可用股票代码。");
      }
      const existing = (alertRulesQuery.data ?? []).find((item) => item.type === type);
      if (existing) {
        return existing;
      }
      const defaultParams: Record<string, string | number | boolean | null> =
        type === "volume_breakout"
          ? { minVolumeRatio: 2, minChangePct: 0 }
          : {};
      return window.stockdesk.alerts.saveRule({
        symbol,
        type,
        name: alertNameByType(type),
        enabled: true,
        params: defaultParams
      });
    },
    onSuccess: async (rule) => {
      setAlertFeedback(`已创建提醒规则：${rule.name}`);
      await queryClient.invalidateQueries({ queryKey: ["alertRules", symbol] });
    },
    onError: (error) => {
      setAlertFeedback(error instanceof Error ? error.message : "创建提醒失败");
    }
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const rule = (alertRulesQuery.data ?? []).find((item) => item.id === ruleId);
      if (!rule) {
        throw new Error("规则不存在。");
      }
      return window.stockdesk.alerts.saveRule({
        id: rule.id,
        symbol: rule.symbol,
        type: rule.type,
        name: rule.name,
        enabled: !rule.enabled,
        params: rule.params
      });
    },
    onSuccess: async (rule) => {
      setAlertFeedback(`${rule.name} 已${rule.enabled ? "启用" : "停用"}`);
      await queryClient.invalidateQueries({ queryKey: ["alertRules", symbol] });
    },
    onError: (error) => {
      setAlertFeedback(error instanceof Error ? error.message : "更新提醒失败");
    }
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      await window.stockdesk.alerts.deleteRule(ruleId);
    },
    onSuccess: async () => {
      setAlertFeedback("提醒规则已删除。");
      await queryClient.invalidateQueries({ queryKey: ["alertRules", symbol] });
      await queryClient.invalidateQueries({ queryKey: ["alertEvents", symbol] });
    },
    onError: (error) => {
      setAlertFeedback(error instanceof Error ? error.message : "删除提醒失败");
    }
  });

  const markReadMutation = useMutation({
    mutationFn: async (eventId: string) => {
      await window.stockdesk.alerts.markEventRead(eventId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alertEvents", symbol] });
    }
  });

  const evaluateAlertMutation = useMutation({
    mutationFn: async () => window.stockdesk.alerts.evaluate(symbol),
    onSuccess: async (result) => {
      setAlertFeedback(result.message);
      await queryClient.invalidateQueries({ queryKey: ["alertEvents", symbol] });
      await queryClient.invalidateQueries({ queryKey: ["alertRules", symbol] });
    },
    onError: (error) => {
      setAlertFeedback(error instanceof Error ? error.message : "手动扫描失败");
    }
  });

  const quote = quoteQuery.data;
  const fallbackQuote = useMemo<QuoteSnapshot | null>(() => {
    if (quote || !symbol) {
      return null;
    }
    const bars = klineQuery.data?.bars ?? [];
    if (bars.length === 0) {
      return null;
    }
    const lastBar = bars[bars.length - 1];
    const prevBar = bars.length > 1 ? bars[bars.length - 2] : lastBar;
    const prevClose = prevBar.close;
    const changePct = prevClose ? ((lastBar.close - prevClose) / prevClose) * 100 : 0;

    return {
      symbol: symbol as `${string}.${"SH" | "SZ" | "BJ"}`,
      name: symbol,
      last: lastBar.close,
      changePct,
      turnover: lastBar.turnover ?? null,
      turnoverRate: null,
      volumeRatio: null,
      high: lastBar.high,
      low: lastBar.low,
      open: lastBar.open,
      prevClose,
      status: "normal",
      updatedAt: klineQuery.data?.updatedAt ?? new Date().toISOString(),
      dataSource: "cache"
    };
  }, [klineQuery.data?.bars, klineQuery.data?.updatedAt, quote, symbol]);
  const displayQuote = quote ?? fallbackQuote;

  const quoteUnavailable = !quoteQuery.isPending && !displayQuote && !quoteQuery.error;
  const klineUnavailable = !klineQuery.isPending && (klineQuery.data?.bars.length ?? 0) === 0;
  const newsUnavailable = !newsQuery.isPending && (newsQuery.data?.length ?? 0) === 0;
  const eventsUnavailable = !eventsQuery.isPending && (eventsQuery.data?.length ?? 0) === 0;
  const marketErrorMessage =
    (quoteQuery.error instanceof Error ? quoteQuery.error.message : null)
    ?? (klineQuery.error instanceof Error ? klineQuery.error.message : null);

  const queueStatusText = queueMessage(queueQuery.data, symbol);
  const isRunningForSymbol = queueQuery.data?.running?.symbol === symbol;
  const isQueuedForSymbol = Boolean(queueQuery.data?.pending.some((item) => item.symbol === symbol));

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <Badge appearance="filled" color="informative">
            Research Workspace
          </Badge>
          <span>{symbol}</span>
          <h2>{profileQuery.data?.name ?? displayQuote?.name ?? "个股详情"}</h2>
          <p className={styles.queueState}>分析队列：{queueStatusText}</p>
        </div>
        <div className={styles.analysisActions}>
          <Button appearance="primary" onClick={() => runAnalysis.mutate("quick_scan_v1")} disabled={runAnalysis.isPending || !settingsQuery.data?.activeLlmProfileId}>
            {queuedTemplate === "quick_scan_v1" ? (isRunningForSymbol ? "分析中" : "排队中") : "快速看盘"}
          </Button>
          <Button appearance="secondary" onClick={() => runAnalysis.mutate("technical_swing_v1")} disabled={runAnalysis.isPending || !settingsQuery.data?.activeLlmProfileId}>
            {queuedTemplate === "technical_swing_v1" ? (isRunningForSymbol ? "分析中" : "排队中") : "技术面主导"}
          </Button>
        </div>
      </header>

      {marketErrorMessage ? <div className={styles.error}>{marketErrorMessage}</div> : null}
      {quoteUnavailable ? <div className={styles.hint}>实时行情暂不可用，已尝试本地缓存与 K 线降级展示。</div> : null}
      {klineUnavailable ? <div className={styles.hint}>K 线数据暂不可用，系统会自动重试拉取。</div> : null}
      {!isRunningForSymbol && isQueuedForSymbol ? <div className={styles.hint}>当前股票分析任务已入队，等待执行。</div> : null}

      <div className={styles.stats}>
        <StatCard title="现价" value={displayQuote ? displayQuote.last.toFixed(2) : "--"} />
        <StatCard
          title="涨跌幅"
          value={displayQuote ? `${displayQuote.changePct.toFixed(2)}%` : "--"}
          accent={displayQuote ? (displayQuote.changePct >= 0 ? "rise" : "fall") : "neutral"}
        />
        <StatCard
          title="状态"
          value={displayQuote?.status ?? "--"}
          footnote={displayQuote ? `更新时间 ${dayjs(displayQuote.updatedAt).format("HH:mm:ss")} · ${displayQuote.dataSource === "live" ? "实时" : "缓存"}` : ""}
        />
      </div>

      <div className={styles.terminalGrid}>
        <aside className={styles.leftRail}>
          <section className={styles.sideCard}>
            <h3>公司概览</h3>
            <div className={styles.sideMetrics}>
              <div>
                <span>名称</span>
                <strong>{profileQuery.data?.name ?? displayQuote?.name ?? "--"}</strong>
              </div>
              <div>
                <span>行业</span>
                <strong>{profileQuery.data?.industry ?? "--"}</strong>
              </div>
              <div>
                <span>上市板块</span>
                <strong>{profileQuery.data?.board ?? "--"}</strong>
              </div>
              <div>
                <span>上市日期</span>
                <strong>{profileQuery.data?.listingDate ?? "--"}</strong>
              </div>
            </div>
          </section>

          <section className={styles.sideCard}>
            <h3>板块联动</h3>
            <div className={styles.linkageCard}>
              <span>行业板块</span>
              <strong>{linkageQuery.data?.industryBoard?.name ?? "暂无"}</strong>
              <p className={styles.meta}>{boardSummary(linkageQuery.data?.industryBoard)}</p>
            </div>
            <div className={styles.conceptList}>
              {(linkageQuery.data?.conceptBoards ?? []).map((item) => (
                <div key={`${item.kind}-${item.code ?? item.name}`} className={styles.linkageChip}>
                  <strong>{item.name}</strong>
                  <span className={linkageAccent(item.changePct)}>{renderSignedPercent(item.changePct)}</span>
                </div>
              ))}
              {(linkageQuery.data?.conceptBoards.length ?? 0) === 0 ? <p className={styles.hint}>暂无概念板块联动。</p> : null}
            </div>
          </section>

          <section className={styles.sideCard}>
            <h3>股票软件视图</h3>
            <div className={styles.sideMetrics}>
              <div>
                <span>今开 / 昨收</span>
                <strong>{formatMetric(displayQuote?.open)} / {formatMetric(displayQuote?.prevClose)}</strong>
              </div>
              <div>
                <span>最高 / 最低</span>
                <strong>{formatMetric(displayQuote?.high)} / {formatMetric(displayQuote?.low)}</strong>
              </div>
              <div>
                <span>成交额 / 换手</span>
                <strong>{formatMarketCap(displayQuote?.turnover)} / {formatMetric(displayQuote?.turnoverRate, "%")}</strong>
              </div>
              <div>
                <span>量比 / 状态</span>
                <strong>{formatMetric(displayQuote?.volumeRatio)} / {displayQuote?.status ?? "--"}</strong>
              </div>
            </div>
          </section>
        </aside>

        <div className={styles.centerColumn}>
          <PriceChart series={klineQuery.data} loading={klineQuery.isPending} />

          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? styles.tabActive : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "analysis" ? (
            <div className={styles.analysisLayout}>
              <section className={styles.panel}>
                <h3>分析任务</h3>
                {runAnalysis.error ? <div className={styles.error}>{runAnalysis.error instanceof Error ? runAnalysis.error.message : "分析失败"}</div> : null}
                {(tasksQuery.data ?? []).map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    className={`${styles.history} ${selectedTaskId === task.id ? styles.historyActive : ""}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div>
                      <strong>{templateLabel(task.templateId)}</strong>
                      <span>{dayjs(task.createdAt).format("YYYY-MM-DD HH:mm")}</span>
                    </div>
                    <p>{task.errorSummary ?? (task.currentStageKey ? `${stageLabels[task.currentStageKey]} · ${taskStatusLabel(task.status)}` : taskStatusLabel(task.status))}</p>
                    <small className={`${styles.taskMeta} ${taskStatusClass(task.status)}`}>
                      {taskStatusLabel(task.status)}
                      {task.currentStageKey ? ` · ${stageLabels[task.currentStageKey]}` : ""}
                    </small>
                  </button>
                ))}
                {(tasksQuery.data?.length ?? 0) === 0 ? <p className={styles.hint}>还没有分析任务。</p> : null}
              </section>

              <section className={styles.panel}>
                <div className={styles.detailHeader}>
                  <div>
                    <h3>分析详情</h3>
                    {selectedTask ? (
                      <p className={styles.meta}>
                        状态：{taskStatusLabel(selectedTask.status)}
                        {selectedTask.currentStageKey ? ` · 当前阶段 ${stageLabels[selectedTask.currentStageKey]}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {selectedTask?.status === "pending" ? (
                    <Button
                      appearance="secondary"
                      size="small"
                      onClick={() => cancelTaskMutation.mutate(selectedTask.id)}
                      disabled={cancelTaskMutation.isPending}
                    >
                      取消待执行
                    </Button>
                  ) : null}
                </div>
                {runDetailQuery.isPending ? <p className={styles.hint}>加载报告中...</p> : null}
                {selectedTask?.status === "failed" ? <div className={styles.error}>{selectedTask.errorSummary ?? "分析任务失败"}</div> : null}
                {runDetailQuery.data ? (
                  <>
                    <p className={styles.meta}>立场：{runDetailQuery.data.stance} · 置信度 {runDetailQuery.data.confidenceScore.toFixed(0)} / 100</p>
                    <div className={styles.reportGrid}>
                      <div className={styles.reportCard}>
                        <h4>结论摘要</h4>
                        <ul>
                          {runDetailQuery.data.result.summary.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                      <div className={styles.reportCard}>
                        <h4>市场与联动</h4>
                        <p>{runDetailQuery.data.result.marketRegime.summary}</p>
                        <ul>
                          {runDetailQuery.data.result.marketRegime.bullets.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className={styles.section}>
                      <h4>技术面</h4>
                      <p>{runDetailQuery.data.result.technicalView.summary}</p>
                      <ul>
                        {runDetailQuery.data.result.technicalView.bullets.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.section}>
                      <h4>财务、新闻与板块</h4>
                      <p>{runDetailQuery.data.result.fundamentalView.summary}</p>
                      <ul>
                        {runDetailQuery.data.result.fundamentalView.bullets.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p>{runDetailQuery.data.result.newsEventView.summary}</p>
                      <ul>
                        {runDetailQuery.data.result.newsEventView.bullets.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p className={styles.meta}>
                        行业 {runDetailQuery.data.result.sectorIndexLinkage.industry ?? "--"} · 概念板块 {runDetailQuery.data.result.sectorIndexLinkage.conceptBoards.join(" / ") || "--"}
                      </p>
                      <p>{runDetailQuery.data.result.sectorIndexLinkage.interpretation}</p>
                    </div>
                    <div className={styles.section}>
                      <h4>风险与反证</h4>
                      <ul>
                        {runDetailQuery.data.result.invalidationSignals.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <div className={styles.riskList}>
                        {runDetailQuery.data.result.riskMatrix.map((risk) => (
                          <div key={`${risk.title}-${risk.level}`} className={styles.riskItem}>
                            <strong>{risk.title}</strong>
                            <small>{risk.level}</small>
                            <p>{risk.detail}</p>
                            <span>{risk.mitigation}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.section}>
                      <h4>行动计划</h4>
                      <div className={styles.actionPlanGrid}>
                        <div>
                          <span>观察价位</span>
                          <strong>{runDetailQuery.data.result.actionPlan.observationLevels.join(" / ") || "--"}</strong>
                        </div>
                        <div>
                          <span>入场思路</span>
                          <strong>{runDetailQuery.data.result.actionPlan.entryIdea}</strong>
                        </div>
                        <div>
                          <span>止损</span>
                          <strong>{runDetailQuery.data.result.actionPlan.stopLossIdea}</strong>
                        </div>
                        <div>
                          <span>止盈</span>
                          <strong>{runDetailQuery.data.result.actionPlan.takeProfitIdea}</strong>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className={styles.hint}>选择左侧任务查看阶段进度和最终报告。</p>
                )}
                <div className={styles.section}>
                  <h4>阶段轨迹</h4>
                  {taskStagesQuery.isPending ? <p className={styles.hint}>加载阶段轨迹中...</p> : null}
                  <div className={styles.timeline}>
                    {(taskStagesQuery.data ?? []).map((stage) => (
                      <div key={stage.id} className={styles.timelineItem}>
                        <div className={styles.timelineHead}>
                          <strong>{stage.title}</strong>
                          <span className={`${styles.taskMeta} ${taskStatusClass(stage.status)}`}>{taskStatusLabel(stage.status)}</span>
                        </div>
                        <p>{stage.summary || "阶段等待执行。"}</p>
                        <small>
                          {stage.startedAt ? dayjs(stage.startedAt).format("MM-DD HH:mm:ss") : "--"}
                          {" → "}
                          {stage.completedAt ? dayjs(stage.completedAt).format("MM-DD HH:mm:ss") : "--"}
                        </small>
                        {stage.errorSummary ? <div className={styles.error}>{stage.errorSummary}</div> : null}
                      </div>
                    ))}
                    {(taskStagesQuery.data?.length ?? 0) === 0 ? <p className={styles.hint}>当前任务还没有阶段轨迹。</p> : null}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "news" ? (
            <section className={styles.panel}>
              <h3>新闻</h3>
              {newsUnavailable ? <p className={styles.hint}>暂无新闻数据</p> : null}
              {(newsQuery.data ?? []).map((item) => (
                <article key={item.id} className={styles.item}>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                  <small>
                    {item.source} · {dayjs(item.publishedAt).format("MM-DD HH:mm")}
                  </small>
                </article>
              ))}
            </section>
          ) : null}

          {activeTab === "events" ? (
            <section className={styles.panel}>
              <h3>公告与事件</h3>
              {eventsUnavailable ? <p className={styles.hint}>暂无事件数据</p> : null}
              {(eventsQuery.data ?? []).map((item) => (
                <article key={item.id} className={styles.item}>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                  <small>
                    {item.source} · {dayjs(item.occurredAt).format("MM-DD HH:mm")}
                  </small>
                </article>
              ))}
            </section>
          ) : null}

          {activeTab === "financial" ? (
            <section className={styles.panel}>
              <h3>财务 / 估值</h3>
              {fundamentalsQuery.error ? <p className={styles.error}>{fundamentalsQuery.error instanceof Error ? fundamentalsQuery.error.message : "财务数据获取失败"}</p> : null}
              <div className={styles.finGrid}>
                <StatCard title="PE(TTM)" value={formatMetric(fundamentalsQuery.data?.peTtm)} />
                <StatCard title="PB" value={formatMetric(fundamentalsQuery.data?.pb)} />
                <StatCard title="PS(TTM)" value={formatMetric(fundamentalsQuery.data?.psTtm)} />
                <StatCard title="总市值" value={formatMarketCap(fundamentalsQuery.data?.totalMarketCap)} />
                <StatCard title="流通市值" value={formatMarketCap(fundamentalsQuery.data?.circulatingMarketCap)} />
                <StatCard title="ROE" value={formatMetric(fundamentalsQuery.data?.roe, "%")} />
                <StatCard title="净利同比" value={formatMetric(fundamentalsQuery.data?.netProfitYoY, "%")} />
                <StatCard title="营收同比" value={formatMetric(fundamentalsQuery.data?.revenueYoY, "%")} />
                <StatCard title="报告期" value={fundamentalsQuery.data?.reportDate ?? "--"} />
              </div>
              <p className={styles.hint}>
                数据源：{fundamentalsQuery.data?.source ?? "--"} · 更新时间 {fundamentalsQuery.data ? dayjs(fundamentalsQuery.data.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "--"}
              </p>
            </section>
          ) : null}

          {activeTab === "alerts" ? (
            <section className={styles.panel}>
              <h3>提醒</h3>
              <p className={styles.hint}>规则触发后会写入本地事件时间线，可手动标记已读。</p>

              <div className={styles.alertSection}>
                <h4>规则列表</h4>
                {(alertRulesQuery.data ?? []).map((rule) => (
                  <div key={rule.id} className={styles.alertRuleItem}>
                    <div>
                      <strong>{rule.name}</strong>
                      <small>{rule.type}</small>
                    </div>
                    <div className={styles.alertRuleActions}>
                      <Button size="small" appearance="secondary" type="button" onClick={() => toggleAlertMutation.mutate(rule.id)}>{rule.enabled ? "停用" : "启用"}</Button>
                      <Button size="small" appearance="secondary" type="button" onClick={() => deleteAlertMutation.mutate(rule.id)}>删除</Button>
                    </div>
                  </div>
                ))}
                {(alertRulesQuery.data?.length ?? 0) === 0 ? <p className={styles.hint}>暂无提醒规则。</p> : null}
              </div>

              <div className={styles.alertSection}>
                <h4>触发记录</h4>
                {(alertEventsQuery.data ?? []).map((event) => (
                  <div key={event.id} className={`${styles.alertEventItem} ${event.readAt ? "" : styles.unread}`}>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.message}</p>
                      <small>{dayjs(event.triggeredAt).format("MM-DD HH:mm:ss")}</small>
                    </div>
                    {!event.readAt ? <Button size="small" appearance="secondary" type="button" onClick={() => markReadMutation.mutate(event.id)}>标记已读</Button> : null}
                  </div>
                ))}
                {(alertEventsQuery.data?.length ?? 0) === 0 ? <p className={styles.hint}>暂无触发记录。</p> : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className={styles.rightRail}>
          <div className={styles.sideCard}>
            <h3>研究快照</h3>
            <div className={styles.sideMetrics}>
              <div>
                <span>队列</span>
                <strong>{queueStatusText}</strong>
              </div>
              <div>
                <span>新闻 / 事件</span>
                <strong>{newsQuery.data?.length ?? 0} / {eventsQuery.data?.length ?? 0}</strong>
              </div>
              <div>
                <span>任务 / 已完成</span>
                <strong>{tasksQuery.data?.length ?? 0} / {(tasksQuery.data ?? []).filter((item) => item.status === "completed").length}</strong>
              </div>
            </div>
          </div>

          <div className={styles.sideCard}>
            <h3>指数联动</h3>
            <div className={styles.linkageList}>
              {(linkageQuery.data?.relatedIndexes ?? []).map((item) => (
                <div key={`${item.kind}-${item.code ?? item.name}`} className={styles.linkageCard}>
                  <div className={styles.linkageHead}>
                    <strong>{item.name}</strong>
                    <span className={linkageAccent(item.changePct)}>{renderSignedPercent(item.changePct)}</span>
                  </div>
                  <p className={styles.meta}>最新 {formatMetric(item.latest)}</p>
                </div>
              ))}
              {(linkageQuery.data?.relatedIndexes.length ?? 0) === 0 ? <p className={styles.hint}>暂无指数联动快照。</p> : null}
            </div>
          </div>

          <div className={styles.sideCard}>
            <h3>财务快照</h3>
            <div className={styles.sideMetrics}>
              <div>
                <span>PE(TTM)</span>
                <strong>{formatMetric(fundamentalsQuery.data?.peTtm)}</strong>
              </div>
              <div>
                <span>PB</span>
                <strong>{formatMetric(fundamentalsQuery.data?.pb)}</strong>
              </div>
              <div>
                <span>ROE</span>
                <strong>{formatMetric(fundamentalsQuery.data?.roe, "%")}</strong>
              </div>
            </div>
          </div>

          <div className={styles.sideCard}>
            <h3>提醒快捷入口</h3>
            <div className={styles.alertActions}>
              <Button appearance="secondary" type="button" onClick={() => addAlertMutation.mutate("price_below_ma20")}>跌破 20 日线</Button>
              <Button appearance="secondary" type="button" onClick={() => addAlertMutation.mutate("volume_breakout")}>放量突破</Button>
              <Button appearance="secondary" type="button" onClick={() => addAlertMutation.mutate("limit_up_open")}>涨停打开</Button>
              <Button appearance="primary" type="button" onClick={() => evaluateAlertMutation.mutate()} disabled={evaluateAlertMutation.isPending}>立即扫描</Button>
            </div>
            {alertFeedback ? <p className={styles.meta}>{alertFeedback}</p> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
