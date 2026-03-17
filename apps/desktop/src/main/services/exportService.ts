import { writeFile } from "node:fs/promises";
import { BrowserWindow } from "electron";
import { AnalysisRepo, SettingsRepo, WatchlistRepo } from "@stockdesk/db";
import type { AnalysisExportFormat, AnalysisExportResult, AnalysisRunDetail, ExportPayload } from "@stockdesk/shared";
import { nowIso } from "@stockdesk/shared";

function escapeMarkdown(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAnalysisMarkdown(runs: AnalysisRunDetail[], exportedAt: string) {
  const lines: string[] = [
    "# StockDesk 分析记录导出",
    "",
    `导出时间: ${exportedAt}`,
    `记录数: ${runs.length}`,
    ""
  ];

  if (runs.length === 0) {
    lines.push("当前筛选条件下没有可导出的记录。", "");
    return lines.join("\n");
  }

  lines.push("## 记录概览", "", "| 时间 | 股票 | 模板 | 结论 | 置信度 | 窗口 |", "| --- | --- | --- | --- | ---: | --- |");
  for (const run of runs) {
    lines.push(`| ${run.createdAt} | ${run.symbol} | ${run.templateId} | ${run.stance} | ${run.confidenceScore} | ${run.forecastWindow} |`);
  }

  for (const run of runs) {
    lines.push(
      "",
      `## ${run.symbol} · ${run.templateId}`,
      "",
      `- 时间: ${run.createdAt}`,
      `- 结论: ${run.stance}`,
      `- 置信度: ${run.confidenceScore}`,
      `- 预测窗口: ${run.forecastWindow}`,
      "",
      "### 摘要",
      run.summary,
      "",
      "### 关键结论"
    );

    for (const line of run.result.summary) {
      lines.push(`- ${escapeMarkdown(line)}`);
    }

    lines.push(
      "",
      "### 技术面",
      `- 概述: ${escapeMarkdown(run.result.technicalView.summary)}`
    );
    for (const line of run.result.technicalView.bullets) {
      lines.push(`- ${escapeMarkdown(line)}`);
    }

    lines.push(
      "",
      "### 财务与事件",
      `- 财务面: ${escapeMarkdown(run.result.fundamentalView.summary)}`,
      `- 新闻事件: ${escapeMarkdown(run.result.newsEventView.summary)}`
    );
    for (const line of [...run.result.fundamentalView.bullets, ...run.result.newsEventView.bullets]) {
      lines.push(`- ${escapeMarkdown(line)}`);
    }

    lines.push("", "### 反证条件");
    for (const line of run.result.invalidationSignals) {
      lines.push(`- ${escapeMarkdown(line)}`);
    }

    lines.push("", "### 风险");
    for (const risk of run.result.riskMatrix) {
      lines.push(`- [${risk.level}] ${escapeMarkdown(risk.title)}: ${escapeMarkdown(risk.detail)} | 应对: ${escapeMarkdown(risk.mitigation)}`);
    }

    lines.push(
      "",
      "### 行动计划",
      `- 观察价位: ${run.result.actionPlan.observationLevels.join(" / ") || "--"}`,
      `- 入场思路: ${escapeMarkdown(run.result.actionPlan.entryIdea)}`,
      `- 止损思路: ${escapeMarkdown(run.result.actionPlan.stopLossIdea)}`,
      `- 止盈思路: ${escapeMarkdown(run.result.actionPlan.takeProfitIdea)}`,
      `- 仓位思路: ${escapeMarkdown(run.result.actionPlan.positionSizingIdea)}`
    );

    lines.push("", "### 情景树");
    lines.push(`- Bull: ${escapeMarkdown(run.result.scenarioTree.bull.thesis)} (${escapeMarkdown(run.result.scenarioTree.bull.probabilityLabel)})`);
    lines.push(`- Base: ${escapeMarkdown(run.result.scenarioTree.base.thesis)} (${escapeMarkdown(run.result.scenarioTree.base.probabilityLabel)})`);
    lines.push(`- Bear: ${escapeMarkdown(run.result.scenarioTree.bear.thesis)} (${escapeMarkdown(run.result.scenarioTree.bear.probabilityLabel)})`);

    lines.push(
      "",
      "### 板块与指数联动",
      `- 行业: ${escapeMarkdown(run.result.sectorIndexLinkage.industry ?? "--")}`,
      `- 概念板块: ${escapeMarkdown(run.result.sectorIndexLinkage.conceptBoards.join(" / ") || "--")}`,
      `- 指数快照: ${escapeMarkdown(run.result.sectorIndexLinkage.indexSnapshot.join(" / ") || "--")}`,
      `- 解读: ${escapeMarkdown(run.result.sectorIndexLinkage.interpretation)}`
    );
  }

  lines.push("");
  return lines.join("\n");
}

async function renderMarkdownPdf(markdown: string) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>StockDesk Export</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #0f172a; line-height: 1.6; font-size: 12px; }
  pre { white-space: pre-wrap; word-break: break-word; font-family: "Cascadia Mono", Consolas, monospace; font-size: 11px; }
</style>
</head>
<body>
<pre>${escapeHtml(markdown)}</pre>
</body>
</html>`;

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });
  } finally {
    window.destroy();
  }
}

export class ExportService {
  constructor(
    private readonly deps: {
      settingsRepo: SettingsRepo;
      watchlistRepo: WatchlistRepo;
      analysisRepo: AnalysisRepo;
    }
  ) {}

  private collectRuns(runIds: string[]) {
    return this.deps.analysisRepo.listRunDetailsByIds(runIds);
  }

  async exportJson(filePath: string) {
    const runs = this.deps.analysisRepo.listRuns().map((run) => this.deps.analysisRepo.getRun(run.id)).filter(Boolean);
    const payload: ExportPayload = {
      settings: this.deps.settingsRepo.getSettings(),
      groups: this.deps.watchlistRepo.listGroups(),
      items: this.deps.watchlistRepo.listItems(),
      analysisRuns: runs as ExportPayload["analysisRuns"],
      exportedAt: nowIso()
    };
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async exportAnalysisRuns(input: { path: string; format: AnalysisExportFormat; runIds: string[] }): Promise<AnalysisExportResult> {
    const runs = this.collectRuns(input.runIds);
    const exportedAt = nowIso();
    const markdown = buildAnalysisMarkdown(runs, exportedAt);

    if (input.format === "markdown") {
      await writeFile(input.path, markdown, "utf8");
      return {
        path: input.path,
        format: input.format,
        exportedCount: runs.length
      };
    }

    const pdf = await renderMarkdownPdf(markdown);
    await writeFile(input.path, pdf);
    return {
      path: input.path,
      format: input.format,
      exportedCount: runs.length
    };
  }
}
