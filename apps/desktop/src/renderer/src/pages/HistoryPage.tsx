import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./HistoryPage.module.css";

function stanceLabel(value: "bullish" | "neutral" | "bearish") {
  if (value === "bullish") {
    return "看多";
  }
  if (value === "bearish") {
    return "看空";
  }
  return "中性";
}

function toDateStartIso(value: string) {
  return value ? dayjs(`${value}T00:00:00`).toISOString() : undefined;
}

function toDateEndIso(value: string) {
  return value ? dayjs(`${value}T23:59:59.999`).toISOString() : undefined;
}

export function HistoryPage() {
  const [symbolFilter, setSymbolFilter] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const startIso = toDateStartIso(startDate);
  const endIso = toDateEndIso(endDate);

  const query = useQuery({
    queryKey: ["analysisRuns", startIso, endIso],
    queryFn: () => window.stockdesk.analysis.listRuns({ start: startIso, end: endIso })
  });

  const runs = query.data ?? [];
  const filteredRuns = useMemo(
    () => runs.filter((run) => {
      const symbolMatch = symbolFilter.trim().length === 0 || run.symbol.toLowerCase().includes(symbolFilter.trim().toLowerCase());
      const templateMatch = templateFilter === "all" || run.templateId === templateFilter;
      return symbolMatch && templateMatch;
    }),
    [runs, symbolFilter, templateFilter]
  );

  useEffect(() => {
    if (filteredRuns.length === 0) {
      setSelectedRunId(null);
      return;
    }
    if (!selectedRunId || !filteredRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(filteredRuns[0].id);
    }
  }, [filteredRuns, selectedRunId]);

  const detailQuery = useQuery({
    queryKey: ["analysisRun", selectedRunId],
    queryFn: () => window.stockdesk.analysis.getRun(selectedRunId as string),
    enabled: Boolean(selectedRunId)
  });

  const exportMutation = useMutation({
    mutationFn: async (format: "markdown" | "pdf") => {
      if (filteredRuns.length === 0) {
        throw new Error("当前筛选条件下没有可导出的记录。");
      }

      const path = await window.stockdesk.system.pickExportPath(format);
      if (!path) {
        return null;
      }

      return window.stockdesk.analysis.exportRuns({
        path,
        format,
        runIds: filteredRuns.map((run) => run.id)
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

  const isGlobalEmpty = runs.length === 0 && !startDate && !endDate;

  return (
    <section className={styles.page}>
      <header>
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
            <input placeholder="筛选股票代码，如 000001.SZ" value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)} />
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
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              清空时间范围
            </button>
            <span className={styles.count}>共 {filteredRuns.length} 条记录</span>
          </div>

          <div className={styles.exportBar}>
            <button type="button" onClick={() => exportMutation.mutate("markdown")} disabled={exportMutation.isPending || filteredRuns.length === 0}>
              导出 Markdown
            </button>
            <button type="button" onClick={() => exportMutation.mutate("pdf")} disabled={exportMutation.isPending || filteredRuns.length === 0}>
              导出 PDF
            </button>
            {feedback ? <span>{feedback}</span> : null}
          </div>

          <div className={styles.layout}>
            <div className={styles.list}>
              {filteredRuns.map((run) => (
                <button
                  type="button"
                  key={run.id}
                  className={`${styles.card} ${selectedRunId === run.id ? styles.active : ""}`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className={styles.rowTop}>
                    <strong>{run.symbol}</strong>
                    <small>{dayjs(run.createdAt).format("MM-DD HH:mm")}</small>
                  </div>
                  <p>{run.summary}</p>
                  <small>
                    {run.templateId} · {stanceLabel(run.stance)} · 置信度 {run.confidenceScore.toFixed(2)} · 窗口 {run.forecastWindow}
                  </small>
                </button>
              ))}
              {filteredRuns.length === 0 ? <div className={styles.emptyList}>当前过滤条件下没有记录。</div> : null}
            </div>

            <div className={styles.detail}>
              {detailQuery.isPending ? <p className={styles.hint}>正在加载记录详情...</p> : null}
              {detailQuery.error ? <p className={styles.error}>{detailQuery.error instanceof Error ? detailQuery.error.message : "记录详情加载失败"}</p> : null}
              {detailQuery.data ? (
                <>
                  <div className={styles.detailHead}>
                    <div>
                      <h3>{detailQuery.data.symbol}</h3>
                      <span>{dayjs(detailQuery.data.createdAt).format("YYYY-MM-DD HH:mm:ss")}</span>
                    </div>
                    <Link to={`/symbol/${detailQuery.data.symbol}`}>打开个股详情</Link>
                  </div>

                  <div className={styles.section}>
                    <h4>结论摘要</h4>
                    <ul>
                      {detailQuery.data.result.summaryLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
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
                      {detailQuery.data.result.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.section}>
                    <h4>观察价位</h4>
                    <p>{detailQuery.data.result.actionPlan.observationLevels.join(" / ") || "--"}</p>
                    <p>止损：{detailQuery.data.result.actionPlan.stopLossIdea}</p>
                    <p>止盈：{detailQuery.data.result.actionPlan.takeProfitIdea}</p>
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
