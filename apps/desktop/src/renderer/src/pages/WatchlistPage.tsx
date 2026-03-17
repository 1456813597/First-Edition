import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input } from "@fluentui/react-components";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import type { SymbolId } from "@stockdesk/shared";
import { useUiStore } from "@/stores/uiStore";
import styles from "./WatchlistPage.module.css";

function formatPercent(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }
  return `${value.toFixed(2)}%`;
}

function formatTurnover(value: number | null | undefined) {
  if (value == null) {
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

function getChinaTradingStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const weekday = parts.find((item) => item.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((item) => item.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((item) => item.type === "minute")?.value ?? 0);

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const totalMinutes = hour * 60 + minute;
  const inMorning = totalMinutes >= 9 * 60 + 30 && totalMinutes < 11 * 60 + 30;
  const inAfternoon = totalMinutes >= 13 * 60 && totalMinutes < 15 * 60;

  return {
    isTrading: isWeekday && (inMorning || inAfternoon),
    clockText: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} CST`
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export function WatchlistPage() {
  const queryClient = useQueryClient();
  const selectedGroupId = useUiStore((state) => state.selectedGroupId);
  const setSelectedGroupId = useUiStore((state) => state.setSelectedGroupId);
  const [symbolsInput, setSymbolsInput] = useState("");
  const [refreshPaused, setRefreshPaused] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [runningSymbol, setRunningSymbol] = useState<SymbolId | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.stockdesk.settings.get()
  });

  const activeLlmProfile = useMemo(() => {
    const settings = settingsQuery.data;
    if (!settings?.activeLlmProfileId) {
      return null;
    }
    return settings.llmProfiles.find((item) => item.id === settings.activeLlmProfileId) ?? null;
  }, [settingsQuery.data]);

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => window.stockdesk.watchlist.listGroups()
  });

  const itemsQuery = useQuery({
    queryKey: ["items", selectedGroupId],
    queryFn: () => window.stockdesk.watchlist.listItems(selectedGroupId),
    refetchInterval: refreshPaused ? false : 5000
  });

  const symbols = useMemo(() => (itemsQuery.data ?? []).map((item) => item.symbol as SymbolId), [itemsQuery.data]);

  const quotesQuery = useQuery({
    queryKey: ["quotes", symbols.join(",")],
    queryFn: () => window.stockdesk.market.getQuotes(symbols),
    refetchInterval: refreshPaused ? false : 5000,
    enabled: symbols.length > 0
  });

  const dataHealthQuery = useQuery({
    queryKey: ["health", "dataSource"],
    queryFn: () => window.stockdesk.settings.testDataSource(),
    refetchInterval: refreshPaused ? false : 30000
  });

  const llmHealthQuery = useQuery({
    queryKey: ["health", "llm", activeLlmProfile?.id],
    queryFn: () => window.stockdesk.settings.testLlmProfile(activeLlmProfile!.id, undefined, "models_only"),
    enabled: Boolean(activeLlmProfile?.id),
    refetchInterval: refreshPaused ? false : 60000
  });

  const addMutation = useMutation({
    mutationFn: async () =>
      window.stockdesk.watchlist.addSymbols({
        symbols: symbolsInput
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        groupId: selectedGroupId
      }),
    onSuccess: async (payload) => {
      setSymbolsInput("");
      const success = payload.items.filter((item) => item.success).length;
      const failed = payload.items.length - success;
      setActionMessage(`添加完成：成功 ${success}，失败 ${failed}`);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => {
      setActionMessage(`添加失败：${getErrorMessage(error) ?? "未知错误"}`);
    }
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const path = await window.stockdesk.system.pickImportFile();
      if (!path) {
        return null;
      }
      const preview = await window.stockdesk.watchlist.importCsv(path);
      return window.stockdesk.watchlist.applyImportPreview(preview);
    },
    onSuccess: async (payload) => {
      if (payload) {
        const success = payload.items.filter((item) => item.success).length;
        const failed = payload.items.length - success;
        setActionMessage(`导入完成：成功 ${success}，失败 ${failed}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (error) => {
      setActionMessage(`导入失败：${getErrorMessage(error) ?? "未知错误"}`);
    }
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const filePath = await window.stockdesk.system.pickExportPath("json");
      if (!filePath) {
        return;
      }
      await window.stockdesk.watchlist.exportJson(filePath);
    },
    onSuccess: () => {
      setActionMessage("导出已完成。");
    },
    onError: (error) => {
      setActionMessage(`导出失败：${getErrorMessage(error) ?? "未知错误"}`);
    }
  });

  const quickScanMutation = useMutation({
    mutationFn: async (symbol: SymbolId) => {
      if (!activeLlmProfile?.id) {
        throw new Error("请先在设置页配置可用的 LLM。");
      }
      return window.stockdesk.analysis.startTask({
        symbol,
        templateId: "quick_scan_v1",
        forecastWindow: "3d",
        llmProfileId: activeLlmProfile.id
      });
    },
    onMutate: (symbol) => {
      setRunningSymbol(symbol);
      setActionMessage(`正在分析 ${symbol}...`);
    },
    onSuccess: async (_, symbol) => {
      setActionMessage(`${symbol} 分析任务已创建，后台会持续执行并写入研究报告。`);
      await queryClient.invalidateQueries({ queryKey: ["analysisTasks"] });
      await queryClient.invalidateQueries({ queryKey: ["analysisQueueStatus"] });
    },
    onError: (error, symbol) => {
      setActionMessage(`${symbol} 分析失败：${getErrorMessage(error) ?? "未知错误"}`);
    },
    onSettled: () => {
      setRunningSymbol(null);
    }
  });

  const batchQuickScanMutation = useMutation({
    mutationFn: async (batchSymbols: SymbolId[]) => {
      if (!activeLlmProfile?.id) {
        throw new Error("请先在设置页配置可用的 LLM。");
      }
      let success = 0;
      let failed = 0;
      for (const symbol of batchSymbols) {
        try {
          await window.stockdesk.analysis.startTask({
            symbol,
            templateId: "quick_scan_v1",
            forecastWindow: "3d",
            llmProfileId: activeLlmProfile.id
          });
          success += 1;
        } catch {
          failed += 1;
        }
      }
      return { success, failed };
    },
    onMutate: (batchSymbols) => {
      setActionMessage(`批量分析进行中，共 ${batchSymbols.length} 只股票。`);
    },
    onSuccess: async (result) => {
      setActionMessage(`批量任务已入队：成功 ${result.success}，失败 ${result.failed}`);
      await queryClient.invalidateQueries({ queryKey: ["analysisTasks"] });
      await queryClient.invalidateQueries({ queryKey: ["analysisQueueStatus"] });
    },
    onError: (error) => {
      setActionMessage(`批量分析失败：${getErrorMessage(error) ?? "未知错误"}`);
    }
  });

  const rows = useMemo(() => {
    const quotes = new Map((quotesQuery.data ?? []).map((item) => [item.symbol, item]));
    return (itemsQuery.data ?? []).map((item) => {
      const latestQuote = quotes.get(item.symbol as SymbolId) ?? null;
      return {
        ...item,
        latestQuote,
        displayName: latestQuote?.name && latestQuote.name !== item.symbol ? latestQuote.name : item.name
      };
    });
  }, [itemsQuery.data, quotesQuery.data]);

  const marketClock = getChinaTradingStatus();
  const liveQuoteCount = rows.filter((item) => item.latestQuote?.dataSource === "live").length;
  const cacheQuoteCount = rows.filter((item) => item.latestQuote?.dataSource === "cache").length;
  const quoteSourceSummary = rows.length === 0
    ? "--"
    : liveQuoteCount > 0 && cacheQuoteCount > 0
      ? `混合（实时 ${liveQuoteCount} / 缓存 ${cacheQuoteCount}）`
      : cacheQuoteCount > 0
        ? `缓存（${cacheQuoteCount}）`
        : liveQuoteCount > 0
          ? `实时（${liveQuoteCount}）`
          : "暂无可用行情";
  const lastRefreshAt = Math.max(
    itemsQuery.dataUpdatedAt ?? 0,
    quotesQuery.dataUpdatedAt ?? 0,
    dataHealthQuery.dataUpdatedAt ?? 0
  );
  const dataSourceOnline = Boolean(dataHealthQuery.data?.ok);
  const llmOnline = Boolean(llmHealthQuery.data?.ok);
  const refreshState = refreshPaused
    ? "已暂停"
    : itemsQuery.isFetching || quotesQuery.isFetching
      ? "刷新中"
      : "自动刷新（5 秒）";
  const runtimeMode = marketClock.isTrading ? "交易时段" : "非交易时段";
  const failureReason =
    (!dataHealthQuery.data?.ok ? dataHealthQuery.data?.message : null)
    ?? getErrorMessage(quotesQuery.error)
    ?? getErrorMessage(itemsQuery.error)
    ?? (activeLlmProfile?.id && !llmHealthQuery.data?.ok ? llmHealthQuery.data?.message : null);

  async function handleManualRefresh() {
    setActionMessage("正在手动刷新...");
    const tasks = [
      groupsQuery.refetch(),
      itemsQuery.refetch(),
      dataHealthQuery.refetch(),
      symbols.length > 0 ? quotesQuery.refetch() : Promise.resolve(null),
      activeLlmProfile?.id ? llmHealthQuery.refetch() : Promise.resolve(null)
    ];
    const results = await Promise.allSettled(tasks);
    const failures = results.filter((item) => item.status === "rejected").length;
    setActionMessage(failures === 0 ? "手动刷新完成。" : `手动刷新完成，${failures} 项失败。`);
  }

  async function handleCopySymbol(symbol: string) {
    try {
      await navigator.clipboard.writeText(symbol);
      setActionMessage(`已复制代码：${symbol}`);
    } catch (error) {
      setActionMessage(`复制失败：${getErrorMessage(error) ?? "浏览器环境限制"}`);
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <Badge appearance="filled" color="informative">
            Market Workspace
          </Badge>
          <span>Watchlist</span>
          <h2>盘中 5 秒刷新，研究结果直接回写本地库</h2>
        </div>
        <div className={styles.actions}>
          <Button appearance="secondary" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
            CSV 导入
          </Button>
          <Button appearance="secondary" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            安全导出
          </Button>
        </div>
      </header>

      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <span>数据源</span>
          <strong className={dataSourceOnline ? styles.online : styles.offline}>
            {dataHealthQuery.isPending ? "检测中" : dataSourceOnline ? "在线" : "离线"}
          </strong>
        </div>
        <div className={styles.statusItem}>
          <span>LLM</span>
          <strong
            className={
              !activeLlmProfile
                ? styles.muted
                : llmOnline
                  ? styles.online
                  : llmHealthQuery.isPending
                    ? styles.muted
                    : styles.offline
            }
          >
            {!activeLlmProfile ? "未配置" : llmHealthQuery.isPending ? "检测中" : llmOnline ? "在线" : "离线"}
          </strong>
        </div>
        <div className={styles.statusItem}>
          <span>最后刷新</span>
          <strong>{lastRefreshAt > 0 ? dayjs(lastRefreshAt).format("HH:mm:ss") : "--"}</strong>
        </div>
        <div className={styles.statusItem}>
          <span>当前模式</span>
          <strong>{runtimeMode}</strong>
        </div>
        <div className={styles.statusItem}>
          <span>行情来源</span>
          <strong>{quoteSourceSummary}</strong>
        </div>
        <div className={styles.statusItem}>
          <span>市场时间</span>
          <strong>{marketClock.clockText}</strong>
        </div>
        <div className={styles.statusItem}>
          <span>刷新状态</span>
          <strong>{refreshState}</strong>
        </div>
      </div>
      {failureReason ? <div className={styles.failure}>最近失败原因：{failureReason}</div> : null}
      {actionMessage ? <div className={styles.message}>{actionMessage}</div> : null}

      <div className={styles.grid}>
        <aside className={styles.groups}>
          <div className={styles.groupsHeader}>
            <strong>分组视图</strong>
            <span>{rows.length} 只</span>
          </div>
          <button className={selectedGroupId === null ? styles.active : ""} onClick={() => setSelectedGroupId(null)}>
            全部
          </button>
          {(groupsQuery.data ?? []).map((group) => (
            <button key={group.id} className={selectedGroupId === group.id ? styles.active : ""} onClick={() => setSelectedGroupId(group.id)}>
              {group.name}
            </button>
          ))}
        </aside>

        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <Input
              value={symbolsInput}
              onChange={(_, data) => setSymbolsInput(data.value)}
              placeholder="输入 000001、000001.SZ 或多个代码"
            />
            <Button appearance="primary" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !symbolsInput.trim()}>
              添加自选
            </Button>
            <Button
              appearance="secondary"
              onClick={() => batchQuickScanMutation.mutate(rows.map((item) => item.symbol as SymbolId))}
              disabled={batchQuickScanMutation.isPending || rows.length === 0 || !activeLlmProfile?.id}
            >
              批量分析
            </Button>
            <Button appearance="secondary" onClick={() => void handleManualRefresh()} disabled={itemsQuery.isFetching && quotesQuery.isFetching}>
              手动刷新
            </Button>
            <Button appearance="secondary" onClick={() => setRefreshPaused((current) => !current)}>
              {refreshPaused ? "恢复刷新" : "暂停刷新"}
            </Button>
          </div>

          <div className={styles.table}>
            <div className={styles.rowHeader}>
              <span>代码</span>
              <span>名称</span>
              <span className={styles.numeric}>现价</span>
              <span className={styles.numeric}>涨跌幅</span>
              <span className={styles.numeric}>成交额</span>
              <span className={styles.numeric}>换手率</span>
              <span className={styles.numeric}>更新时间</span>
              <span>操作</span>
            </div>
            {rows.map((item) => {
              const changePct = item.latestQuote?.changePct ?? null;
              const changeClass = changePct == null ? styles.muted : changePct >= 0 ? styles.rise : styles.fall;
              return (
                <div className={styles.row} key={item.id}>
                  <div className={styles.symbolCell}>
                    <strong>{item.symbol}</strong>
                    <button type="button" className={styles.inlineButton} onClick={() => void handleCopySymbol(item.symbol)}>
                      复制
                    </button>
                  </div>
                  <span>{item.displayName}</span>
                  <span className={styles.numeric}>{item.latestQuote ? item.latestQuote.last.toFixed(2) : "--"}</span>
                  <span className={`${styles.numeric} ${changeClass}`}>{formatPercent(changePct)}</span>
                  <span className={styles.numeric}>{formatTurnover(item.latestQuote?.turnover)}</span>
                  <span className={styles.numeric}>{formatPercent(item.latestQuote?.turnoverRate)}</span>
                  <span className={styles.numeric}>{item.latestQuote ? dayjs(item.latestQuote.updatedAt).format("HH:mm:ss") : "--"}</span>
                  <div className={styles.rowActions}>
                    <Button
                      size="small"
                      appearance="primary"
                      type="button"
                      onClick={() => quickScanMutation.mutate(item.symbol as SymbolId)}
                      disabled={quickScanMutation.isPending || !activeLlmProfile?.id}
                    >
                      {runningSymbol === item.symbol ? "分析中" : "分析"}
                    </Button>
                    <Link to={`/symbol/${item.symbol}`}>打开</Link>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 ? <div className={styles.empty}>暂无自选股，先从上方添加或导入。</div> : null}
          </div>
        </div>

        <aside className={styles.insightRail}>
          <div className={styles.railCard}>
            <strong>运行概览</strong>
            <div className={styles.railMetrics}>
              <div>
                <span>交易状态</span>
                <strong>{runtimeMode}</strong>
              </div>
              <div>
                <span>数据源</span>
                <strong>{dataSourceOnline ? "在线" : "离线"}</strong>
              </div>
              <div>
                <span>LLM</span>
                <strong>{activeLlmProfile ? (llmOnline ? "在线" : "离线") : "未配置"}</strong>
              </div>
            </div>
          </div>

          <div className={styles.railCard}>
            <strong>研究提示</strong>
            <ul className={styles.railList}>
              <li>优先对当前分组执行批量分析，减少无关 token 消耗。</li>
              <li>混合行情来源时，先关注缓存与实时结果不一致的标的。</li>
              <li>个股详情页现在是主研究区，图表、新闻、事件和提醒会在同页联动。</li>
            </ul>
          </div>

          <div className={styles.railCard}>
            <strong>统计</strong>
            <div className={styles.railMetrics}>
              <div>
                <span>实时行情</span>
                <strong>{liveQuoteCount}</strong>
              </div>
              <div>
                <span>缓存行情</span>
                <strong>{cacheQuoteCount}</strong>
              </div>
              <div>
                <span>最后刷新</span>
                <strong>{lastRefreshAt > 0 ? dayjs(lastRefreshAt).format("HH:mm:ss") : "--"}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
